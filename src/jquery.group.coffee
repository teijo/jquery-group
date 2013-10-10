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

  teamPositionFromMatch = (participants, team) ->
    participants.findIndex((p) -> p.id == team.id)

  unwrap = (state) ->
    teams: state.participants.value()
    matches: state.matches.map((match) ->
      # Create all new object, mutating match breaks internal state
      a:
        team: teamPositionFromMatch(state.participants, match.a.team)
        score: match.a.score
      b:
        team: teamPositionFromMatch(state.participants, match.b.team)
        score: match.b.score
      round: match.round
    ).value()

  makeStandings = (participants, pairs) ->
    participants.map((it) ->
      matches = pairs.filter((match) ->
        match.a.score isnt null and match.b.score isnt null
      ).filter((match) ->
        match.a.team is it or match.b.team is it
      ).map((match) ->
        if match.a.team is it
          ownScore: match.a.score
          opponentScore: match.b.score
        else
          ownScore: match.b.score
          opponentScore: match.a.score
      )
      roundWins = matches.reduce(((acc, match) ->
        acc + match.ownScore
      ), 0)
      roundLosses = matches.reduce(((acc, match) ->
        acc + match.opponentScore
      ), 0)
      wins = matches.filter((match) ->
        match.ownScore > match.opponentScore
      ).size()
      losses = matches.filter((match) ->
        match.ownScore < match.opponentScore
      ).size()
      ties = matches.filter((match) ->
        match.ownScore is match.opponentScore
      ).size()
      team: it
      wins: wins
      losses: losses
      ties: ties
      points: wins * 3 + ties
      roundWins: roundWins
      roundLosses: roundLosses
      ratio: roundWins - roundLosses
    ).sortBy((it) ->
      -it.ratio
    ).sortBy (it) ->
      -it.points

  numberRe = new RegExp(/^[0-9]+$/)

  standingsScoreColumnMarkup = '
    <td>{{wins}}</td>
    <td>{{losses}}</td>
    <td>{{ties}}</td>
    <td>{{points}}</td>
    <td title="Won {{roundWins}}, lost {{roundLosses}} bouts">{{ratio}}</td>'

  standingsViewTemplate = Handlebars.compile('
    <div class="standings">
    <table>
    <colgroup>
    <col style="width: 50%">
    <col span="5" style="width: 10%">
    </colgroup>
    <tr><th></th><th>W</th><th>L</th><th>T</th><th>P</th><th>R</th></tr>
    {{#each this}}
    <tr><td>{{team.name}}</td>'+standingsScoreColumnMarkup+'</tr>
    {{/each}}
    </table>
    </div>')

  standingsEditTemplate = Handlebars.compile('
    <div class="standings">
    <table>
    <colgroup>
    <col style="width: 40%">
    <col span="6" style="width: 10%">
    </colgroup>
    <tr><th></th><th>W</th><th>L</th><th>T</th><th>P</th><th>R</th><th>Drop?</th></tr>
    {{#each this}}
    <tr><td><input class="name" type="text" data-prev="{{team.name}}" data-teamid="{{team.id}}" value="{{team.name}}" /></td>'+standingsScoreColumnMarkup+'<td class="drop" data-name="{{team.id}}">Drop</td></tr>
    {{/each}}
    <tr><td><input class="add" type="text" value="{{name}}" /></td><td colspan="6"><input type="submit" value="Add" disabled="disabled" /></td></tr>
    </table>
    </div>')

  roundTemplate = Handlebars.compile('
    <div data-roundid="{{this}}" class="round">
    {{#if this}}
    <header>Round {{this}}</header>
    {{else}}
    <header>Unassigned</header>
    {{/if}}
    </div>')

  matchViewTemplate = Handlebars.compile('
    <div data-matchid="{{id}}" class="match" draggable="{{draggable}}">
    <span class="home">{{a.team.name}}</span>
    <div class="home">{{a.score}}</div>
    <div class="away">{{b.score}}</div>
    <span class="away">{{b.team.name}}</span>
    </div>')

  matchEditTemplate = Handlebars.compile('
    <div data-matchid="{{id}}" class="match" draggable="{{draggable}}">
    <span class="home">{{a.team.name}}</span>
    <input type="text" class="home" value="{{a.score}}" />
    <input type="text" class="away" value="{{b.score}}" />
    <span class="away">{{b.team.name}}</span>
    </div>')

  roundsTemplate = Handlebars.compile('<div class="rounds"></div>')

  # If attached to backend, these functions could be overridden and return newly
  # allocated identifier via Ajax query. For standalone purposes, we can just
  # increment the integer.
  localMatchCounter = 0
  generateNewMatchId = () ->
    ++localMatchCounter

  localTeamCounter = 0
  generateNewTeamId = () ->
    ++localTeamCounter

  group = ($container, participants, pairs, onchange) ->

    roundById = (id) ->
      $container.find("[data-roundid='#{id}']")

    matchById = (id) ->
      $container.find("[data-matchid='#{id}']")

    $container.addClass "read-write"  if onchange
    templates = (->
      standings: (participantStream, renameStream, removeStream, participants) ->
        participants = participants or _([])
        return $(standingsViewTemplate(participants.value()))  unless onchange
        markup = $(standingsEditTemplate(participants.value()))
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
            id: parseInt(el.attr("data-teamid"))
            to: el.val()
          el.attr "data-prev", el.val()

        markup.find("input.add").asEventStream("change").filter(isValid).map(".target").map($).map((el) ->
          el.val()
        ).onValue (value) ->
          participantStream.push
            id: generateNewTeamId()
            name: value

        markup.find("td.drop").asEventStream("click").map(".target").map($).map((el) ->
          el.attr("data-name")
        ).onValue (value) ->
          removeStream.push parseInt(value)

        markup

      rounds: $(roundsTemplate())
      round: (roundNumber) -> $(roundTemplate(roundNumber))
      matchEdit: (match) -> $(matchEditTemplate(match))
      matchView: (match) -> $(matchViewTemplate(match))
    )()

    Round = (->
      create: (moveStream, round) ->
        new ->
          r = templates.round(round)
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
            obj = matchById(id)
            $el.append obj
            $el.removeClass "over"
            moveStream.push
              match: parseInt(id)
              round: parseInt($el.attr("data-roundId"))
            return
          return
    )()

    Match = (->
      create: (resultStream, match) ->
        new ->
          match = $.extend({}, match)
          match.draggable = (onchange?).toString()

          unless onchange
            @markup = templates.matchView(match)
            return

          markup = templates.matchEdit(match)
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
                team: match.a.team
                score: scoreA
              b:
                team: match.b.team
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
        newMatches = propertyValue.participants.map((it) ->
          id: generateNewMatchId()
          a:
            team: it
            score: null
          b:
            team: streamValue
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
      propertyValue.matches.filter((it) ->
        it.a.team.id == streamValue || it.b.team.id == streamValue
      ).map((it) -> it.id).forEach (id) -> matchById(id).remove()

      roundsBefore = roundCount(propertyValue.participants.size())

      propertyValue.participants = propertyValue.participants.filter (it) ->
        it.id != streamValue

      roundsAfter = roundCount(propertyValue.participants.size())

      propertyValue.matches = propertyValue.matches.filter((it) ->
        it.a.team.id != streamValue && it.b.team.id != streamValue
      ).map((it) ->
        if it.round > roundsAfter
          it.round = 0
        it
      )

      $unassigned = roundById(0)
      _(_.range(roundsAfter + 1, roundsBefore + 1)).each (id) ->
        $roundToBeDeleted = roundById(id)
        $moved = $roundToBeDeleted.find('.match')
        $unassigned.append $moved
        $roundToBeDeleted.remove()

      propertyValue
    )

    resultUpdates = matchProp.sampledBy(resultStream, (propertyValue, streamValue) ->
      propertyValue.matches = propertyValue.matches.map((it) ->
        if it.a.team.id is streamValue.a.team.id and it.b.team.id is streamValue.b.team.id
          if streamValue.round != undefined
            it.round = streamValue.round
          it.a.score = streamValue.a.score
          it.b.score = streamValue.b.score
        else if it.a.team.id is streamValue.b.team.id and it.b.team.id is streamValue.a.team.id
          if streamValue.round != undefined
            it.round = streamValue.round
          it.a.score = streamValue.b.score
          it.b.score = streamValue.a.score
        it
      )
      propertyValue
    )

    participantRenames = matchProp.sampledBy(renameStream, (propertyValue, streamValue) ->
      propertyValue.participants = propertyValue.participants.map((it) ->
        if it.id == streamValue.id
          it.name = streamValue.to
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
      onchange(unwrap(state)) if onchange

    participantAdds.merge(resultUpdates).merge(participantRemoves).throttle(10).onValue (state) ->
      $container.find(".standings").replaceWith templates.standings(participantStream,
        renameStream, removeStream, makeStandings(state.participants, state.matches), null)

    $standings.replaceWith templates.standings(participantStream)

    participantRenames.merge(participantAdds).merge(resultUpdates).throttle(10).onValue (state) ->
      assignedMatches = state.matches.filter(((it) -> it.round))
      unassignedMatches = state.matches.filter(((it) -> !it.round))

      assignedMatches.each (it) ->
        $match = matchById(it.id)
        markup = Match.create(resultStream, it).markup
        if $match.length
          $match.replaceWith markup
        else
          roundById(it.round).append markup

      if unassignedMatches.size() > 0 || onchange
        $unassigned = roundById(0)
        if $unassigned.length == 0
          $unassigned = $(Round.create(moveStream, 0).markup).appendTo($container)
        unassignedMatches.each (it) ->
          $match = matchById(it.id)
          markup = Match.create(resultStream, it).markup
          if $match.length
            $match.replaceWith markup
          else
            $unassigned.append(markup)

    participants.each (it) ->
      participantStream.push it

    pairs.each (it) ->
      resultStream.push it

  methods = init: (opts) ->
    opts = opts or {}
    container = this
    participants = _()
    pairs  = _()

    if opts.init
      participants = _(opts.init.teams)
      pairs = _(opts.init.matches).map (it) ->
        it.a.team = opts.init.teams[it.a.team]
        it.b.team = opts.init.teams[it.b.team]
        it

    group($('<div class="jqgroup"></div>').appendTo(container), participants, pairs, opts.save or null)

  $.fn.group = (method) ->
    if methods[method]
      methods[method].apply this, Array::slice.call(arguments, 1)
    else if typeof method is "object" or not method
      methods.init.apply this, arguments
    else
      $.error "Method #{method} does not exist on jQuery.group"
) jQuery
