(($) ->
  # 2n teams -> n-1 rounds, 2n+1 teams -> n rounds
  roundCount = (participantCount) ->
    participantCount - 1 + (participantCount % 2)

  toIntOrNull = (string) ->
    return null  unless numberRe.test(string)
    value = parseInt(string)
    (if isNaN(value) then null else value)

  evTarget = (ev) ->
    $ ev.currentTarget

  evElTarget = (ev) ->
    [ev, evTarget(ev)]

  makeStandings = (participants, pairs) ->
    participants.map((it) ->
      matches = pairs.filter((match) ->
        match.a.score isnt null and match.b.score isnt null
      ).filter((match) ->
        match.a.name is it or match.b.name is it
      ).map((match) ->
        if match.a.name is it
          ownScore: match.a.score
          opponentScore: match.b.score
        else
          ownScore: match.b.score
          opponentScore: match.a.score
      )
      wins = matches.filter((match) ->
        match.ownScore > match.opponentScore
      ).size()
      losses = matches.filter((match) ->
        match.ownScore < match.opponentScore
      ).size()
      ties = matches.filter((match) ->
        match.ownScore is match.opponentScore
      ).size()
      name: it
      wins: wins
      losses: losses
      ties: ties
      points: wins * 3 + ties
    ).sortBy (it) ->
      -it.points

  numberRe = new RegExp(/^[0-9]+$/)


  # If attached to backend, this function could be overridden and return newly
  # allocated identifier via Ajax query. For standalone purposes, we can just
  # increment the integer.
  localCounter = 0
  generateNewMatchId = () ->
    ++localCounter

  group = ($container, participants, pairs, onchange) ->
    $container.addClass "read-write"  if onchange
    templates = (->
      readOnlyMarkup = Handlebars.compile('
        <div class="standings">
        <table>
        <colgroup>
        <col style="width: 60%">
        <col span="4" style="width: 10%">
        </colgroup>
        <tr><th></th><th>W</th><th>L</th><th>T</th><th>P</th></tr>
        {{#each this}}
        <tr><td>{{name}}</td><td>{{wins}}</td><td>{{losses}}</td><td>{{ties}}</td><td>{{points}}</td></tr>
        {{/each}}
        </table>
        </div>')

      standingsMarkup = Handlebars.compile('
        <div class="standings">
        <table>
        <colgroup>
        <col style="width: 60%">
        <col span="4" style="width: 10%">
        </colgroup>
        <tr><th></th><th>W</th><th>L</th><th>T</th><th>P</th><th>Drop?</th></tr>
        {{#each this}}
        <tr><td><input class="name" type="text" data-prev="{{name}}" value="{{name}}" /></td><td>{{wins}}</td><td>{{losses}}</td><td>{{ties}}</td><td>{{points}}</td><td class="drop" data-name="{{name}}">Drop</td></tr>
        {{/each}}
        <tr><td><input class="add" type="text" value="{{name}}" /></td><td colspan="5"><input type="submit" value="Add" disabled="disabled" /></td></tr>
        </table>
        </div>')

      roundsMarkup = Handlebars.compile('<div class="rounds"></div>')

      standings: (participantStream, renameStream, removeStream, participants) ->
        participants = participants or _([])
        return $(readOnlyMarkup(participants.value()))  unless onchange
        markup = $(standingsMarkup(participants.value()))
        $submit = markup.find("input[type=submit]")

        keyUps = markup.find("input").asEventStream("keyup").map(evTarget).map(($el) ->
          value = $el.val()
          previous = $el.attr("data-prev")
          valid = value.length > 0 and (not participants.pluck("name").contains(value) or previous is value)
          el: $el
          value: value
          valid: valid
        ).toProperty()

        keyUps.onValue (state) ->
          state.el.toggleClass "conflict", not state.valid
          if state.el.hasClass("add")
            if state.valid
              $submit.removeAttr "disabled"
            else
              $submit.attr "disabled", "disabled"

        isValid = keyUps.map((state) ->
          state.valid
        ).toProperty()

        markup.find("input.name").asEventStream("change").filter(isValid).map(".target").map($).onValue (el) ->
          renameStream.push
            from: el.attr("data-prev")
            to: el.val()
          el.attr "data-prev", el.val()

        markup.find("input.add").asEventStream("change").filter(isValid).map(".target").map($).map((el) ->
          el.val()
        ).onValue (value) ->
          participantStream.push value

        markup.find("td.drop").asEventStream("click").map(".target").map($).map((el) ->
          el.attr("data-name")
        ).onValue (value) ->
          removeStream.push value

        markup

      rounds: $(roundsMarkup())
    )()

    Round = (->
      template = Handlebars.compile('
        <div data-roundId="{{round}}" class="round" style="width: {{width}}%">
        {{#if round}}
          <header>Round {{round}}</header>
        {{else}}
          <header>Unassigned</header>
        {{/if}}
        </div>')
      create: (moveStream, round) ->
        new ->
          r = $(template(
            round: round
            width: 100
          ))
          @markup = r

          unless onchange
            return

          # Browser compatible hack for ignoring child objects' enter/leave
          # events http://stackoverflow.com/a/10906204
          eventCounter = 0

          r.asEventStream("dragover").doAction(".preventDefault").onValue((ev) -> )
          r.asEventStream("dragenter").doAction(".preventDefault").map(evTarget)
            .onValue ($el) ->
              if eventCounter == 0
                $el.addClass "over"
              eventCounter++
              return

          r.asEventStream("dragleave").doAction(".preventDefault").map(evTarget)
            .onValue ($el) ->
              eventCounter--
              if eventCounter == 0
                $el.removeClass "over"
              return

          r.asEventStream("drop").doAction(".preventDefault").map(evElTarget).onValues (ev, $el) ->
            eventCounter = 0
            id = ev.originalEvent.dataTransfer.getData("Text")
            obj = $container.find("[data-matchId=\"" + id + "\"]")
            $el.append obj
            $el.removeClass "over"
            moveStream.push
              match: parseInt(id)
              round: parseInt($el.attr("data-roundId"))
            return
          return
    )()

    Match = (->
      readOnlyTemplate = Handlebars.compile('
        <div data-matchId="{{id}}" class="match" draggable="{{draggable}}">
        <span class="home">{{a.name}}</span>
        <div class="home">{{a.score}}</div>
        <div class="away">{{b.score}}</div>
        <span class="away">{{b.name}}</span>
        </div>')
      template = Handlebars.compile('
        <div data-matchId="{{id}}" class="match" draggable="{{draggable}}">
        <span class="home">{{a.name}}</span>
        <input type="text" class="home" value="{{a.score}}" />
        <input type="text" class="away" value="{{b.score}}" />
        <span class="away">{{b.name}}</span>
        </div>')

      create: (resultStream, match) ->
        new ->
          match = $.extend({}, match)
          match.draggable = (onchange?).toString()

          unless onchange
            @markup = $(readOnlyTemplate(match))
            return

          markup = $(template(match))
          @markup = markup

          markup.find("input").asEventStream("keyup").map(evTarget).onValue(($el) ->
            $el.toggleClass "conflict", toIntOrNull($el.val()) is null
          )

          markup.find("input").asEventStream("change").onValue ->
            scoreA = toIntOrNull(markup.find("input.home").val())
            scoreB = toIntOrNull(markup.find("input.away").val())
            return if scoreA is null or scoreB is null

            update =
              a:
                name: match.a.name
                score: scoreA
              b:
                name: match.b.name
                score: scoreB

            resultStream.push update

          markup.asEventStream("dragstart").map(".originalEvent").map(evElTarget).onValues (ev, $el) ->
            ev.dataTransfer.setData "Text", match.id
            $el.css "opacity", 0.5
            $container.find(".round").addClass "droppable"

          markup.asEventStream("dragend").map(".originalEvent").map(evElTarget).onValues (ev, $el) ->
            $el.css "opacity", 1.0
            $container.find(".droppable").removeClass "droppable"

          return
    )()

    $standings = $('<div class="standings"></div>').appendTo($container)
    $rounds = templates.rounds.appendTo($container)
    matchStream = new Bacon.Bus()
    participantStream = new Bacon.Bus()
    renameStream = new Bacon.Bus()
    resultStream = new Bacon.Bus()
    moveStream = new Bacon.Bus()
    removeStream = new Bacon.Bus()
    matchProp = matchStream.toProperty(
      participants: _([])
      matches: _([])
    )

    participantAdds = matchProp.sampledBy(participantStream, (propertyValue, streamValue) ->
      if propertyValue.participants.size() > 0
        newMatches = propertyValue.participants.map((it, i) ->
          id: generateNewMatchId()
          a:
            name: it
            score: null
          b:
            name: streamValue
            score: null
        )
        propertyValue.matches = propertyValue.matches.union(newMatches.value())

      propertyValue.participants.push streamValue
      rounds = roundCount(propertyValue.participants.size())
      _(_.range($rounds.find(".round").length, rounds)).each (it) ->
        $rounds.append Round.create(moveStream, it + 1).markup

      propertyValue
    )

    participantRemoves = matchProp.sampledBy(removeStream, (propertyValue, streamValue) ->
      ###propertyValue.participants.push streamValue
      rounds = roundCount(propertyValue.participants.size())
      _(_.range($rounds.find(".round").length, rounds)).each (it) ->
        $rounds.append Round.create(moveStream, it + 1).markup
      ###
      propertyValue.matches.filter((it) ->
        it.a.name == streamValue || it.b.name == streamValue
      ).map((it) -> it.id).forEach (id) -> $container.find('[data-matchId="' + id + '"]').remove()

      propertyValue.participants = propertyValue.participants.filter (it) ->
        it != streamValue
      propertyValue.matches = propertyValue.matches.filter (it) ->
        it.a.name != streamValue && it.b.name != streamValue
      propertyValue
    )

    resultUpdates = matchProp.sampledBy(resultStream, (propertyValue, streamValue) ->
      propertyValue.matches = propertyValue.matches.map((it) ->
        if it.a.name is streamValue.a.name and it.b.name is streamValue.b.name
          it.round = streamValue.round
          it.a.score = streamValue.a.score
          it.b.score = streamValue.b.score
        else if it.a.name is streamValue.b.name and it.b.name is streamValue.a.name
          it.round = streamValue.round
          it.a.score = streamValue.b.score
          it.b.score = streamValue.a.score
        it
      )
      propertyValue
    )

    participantRenames = matchProp.sampledBy(renameStream, (propertyValue, streamValue) ->
      propertyValue.participants = propertyValue.participants.map((it) ->
        if it is streamValue.from
          streamValue.to
        else
          it
      )
      propertyValue.matches = propertyValue.matches.map((it) ->
        if it.a.name is streamValue.from
          it.a.name = streamValue.to
        else it.b.name = streamValue.to  if it.b.name is streamValue.from
        it
      )
      propertyValue
    )

    participantMoves = matchProp.sampledBy(moveStream, (propertyValue, streamValue) ->
      propertyValue.matches = propertyValue.matches.map((it) ->
        it.round = streamValue.round  if it.id is streamValue.match
        it
      )
      propertyValue
    )

    result = Bacon.mergeAll([participantAdds, resultUpdates, participantRenames, participantRemoves, participantMoves])

    result.throttle(10).onValue (state) ->
      onchange state.matches.value()  if onchange

    participantAdds.merge(resultUpdates).merge(participantRemoves).throttle(10).onValue (state) ->
      $container.find(".standings").replaceWith templates.standings(participantStream,
        renameStream, removeStream, makeStandings(state.participants, state.matches), null)

    $standings.replaceWith templates.standings(participantStream)

    participantRenames.merge(participantAdds).merge(resultUpdates).throttle(10).onValue (state) ->
      $matches = $container.find(".match")

      assignedMatches = state.matches.filter(((it) -> it.round))
      unassignedMatches = state.matches.filter(((it) -> !it.round))

      assignedMatches.each (it) ->
        $match = $matches.filter('[data-matchId="' + it.id + '"]')
        markup = Match.create(resultStream, it).markup
        if $match.length
          $match.replaceWith markup
        else
          $container.find("div.round").filter('[data-roundId="' + it.round + '"]').append markup

      if unassignedMatches.size() > 0 || onchange
        $unassigned = $container.find('[data-roundId=0]')
        if $unassigned.length == 0
          $unassigned = $(Round.create(moveStream, 0).markup).appendTo($container)
        unassignedMatches.each (it) ->
          markup = Match.create(resultStream, it).markup
          $unassigned.append(markup)

    participants.each (it) ->
      participantStream.push it

    pairs.each (it) ->
      resultStream.push it

  methods = init: (opts) ->
    opts = opts or {}
    container = this
    pairs = _(opts.init)
    participants = pairs.pluck("a").union(pairs.pluck("b").value()).pluck("name").unique()
    new group($('<div class="jqgroup"></div>').appendTo(container), participants, pairs, opts.save or null)

  $.fn.group = (method) ->
    if methods[method]
      methods[method].apply this, Array::slice.call(arguments, 1)
    else if typeof method is "object" or not method
      methods.init.apply this, arguments
    else
      $.error "Method " + method + " does not exist on jQuery.group"
) jQuery
