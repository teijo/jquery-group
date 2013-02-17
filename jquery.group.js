function makeStandings(participants, pairs) {
  return participants.map(function(it) {
    var matches = pairs
      .filter(function(match) { return match.a.score !== null && match.b.score !== null })
      .filter(function(match) { return match.a.name === it || match.b.name === it })
      .map(function(match) {
        if (match.a.name === it)
          return { ownScore: match.a.score, opponentScore: match.b.score }
        else
          return { ownScore: match.b.score, opponentScore: match.a.score }
      })
    var wins = matches.filter(function(match) { return (match.ownScore > match.opponentScore) }).size()
    var losses = matches.filter(function(match) { return (match.ownScore < match.opponentScore) }).size()
    var ties = matches.filter(function(match) { return (match.ownScore == match.opponentScore) }).size()
    return {
      name: it,
      wins: wins,
      losses: losses,
      ties: ties,
      points: wins * 3 + ties
    }
  }).sortBy(function(it) { return -it.points })
}

$(function() {
  var participants = _(["a", "b", "c", "d", "e"])
  var pairs = participants.map(function(it, i) {
    return participants.filter(function(_, j) { return j < i }).map(function(it2) {
      return { home: it, homeScore: ~~(Math.random()*10)%10, away: it2, awayScore: ~~(Math.random()*10)%10 }
    }).value()
  }).flatten(true)
  var $container = $('<div class="jqgroup"></div>').appendTo('#container')
  var templates = (function() {
    var standingsMarkup = Handlebars.compile(
      '<div class="standings">'
      +'Standings'
      +'<table>'
      +'<colgroup>'
      +'<col style="width: 60%">'
      +'<col span="4" style="width: 10%">'
      +'</colgroup>'
      +'<tr><th>Name</th><th>W</th><th>L</th><th>T</th><th>P</tr>'
      +'{{#each this}}'
      +'<tr><td><input class="name" data-prev="{{name}}" value="{{name}}" /></td><td>{{wins}}</td><td>{{losses}}</td><td>{{ties}}</td><td>{{points}}</td></tr>'
      +'{{/each}}'
      +'</table>'
      +'<input class="add" value="{{name}}" /><input type="submit" value="Add" />'
      +'</div>')
    var roundsMarkup = Handlebars.compile(
      '<div class="rounds"></div>')
    var unassignedMarkup = Handlebars.compile(
      '<div class="unassigned"></div>')
    return {
      standings: function(participantStream, renameStream, participants) {
        var markup = $(standingsMarkup(participants.value()))
        markup.find('input.name').asEventStream('change')
          .map('.target')
          .map($)
          .onValue(function(el) {
            renameStream.push({ from: el.attr('data-prev'), to: el.val() })
            el.attr('data-prev', el.val())
          })
        markup.find('input.add').asEventStream('change')
          .map('.target')
          .map($)
          .map(function(el) { return el.val() })
          .onValue(function(value) { participantStream.push(value) })
        return markup
      },
      rounds: $(roundsMarkup()),
      unassigned: $(unassignedMarkup())
    }
  })()

  var Round = (function() {
    var template = Handlebars.compile(
      '<div class="round"><header>Round {{this}}</header></div>')

    return {
      create: function(round) {
        return new function() {
          var r = $(template(round))
          this.markup = r
          r.asEventStream('dragover').doAction('.preventDefault').onValue(function(ev) { })
          r.asEventStream('dragenter').doAction('.preventDefault').onValue(function(ev) { $(ev.target).addClass('over') })
          r.asEventStream('dragleave').doAction('.preventDefault').onValue(function(ev) { $(ev.target).removeClass('over') })
          r.asEventStream('drop').doAction('.preventDefault').onValue(function(ev) {
            var id = ev.originalEvent.dataTransfer.getData('Text')
            var obj = $('[data-id="'+id+'"]')
            $(ev.target).append(obj)
            $(ev.target).removeClass('over')
          })
        }
      }
    }
  })()

  var Match = (function() {
    var id = 0
    var template = Handlebars.compile(
      '<div data-id="{{id}}" class="match" draggable="true">'
      +'<span class="home">{{a.name}}</span>'
      +'<input class="home" value="{{a.score}}" />'
      +'<input class="away" value="{{b.score}}" />'
      +'<span class="away">{{b.name}}</span>'
      +'</div>')

    return {
      create: function(resultStream, match) {
        return new function() {
          var that = this
          var markup = $(template(match))
          this.markup = markup

          markup.find('input').asEventStream('change').onValue(function() {
            var update = { a: { name: match.a.name, score: parseInt(markup.find('input.home').val()) },
                           b: { name: match.b.name, score: parseInt(markup.find('input.away').val()) } }
            resultStream.push(update)
          })

          markup.asEventStream('dragstart').map(".originalEvent").onValue(function(ev) {
            ev.dataTransfer.setData('Text', match.id)
            $(ev.target).css('opacity', 0.5)
            $('.round').addClass('droppable')
          })

          markup.asEventStream('dragend').map(".originalEvent").onValue(function(ev) {
            $(ev.target).css('opacity', 1.0)
            $('.round').removeClass('droppable')
          })
        }
      }
    }
  })()

  var matchStream = new Bacon.Bus()
  var participantStream = new Bacon.Bus()
  var renameStream = new Bacon.Bus()
  var resultStream = new Bacon.Bus()

  var matchProp = matchStream.toProperty({ participants: _([]), matches: _([]) })
  var participantAdds = matchProp.sampledBy(participantStream, function(propertyValue, streamValue) {
    if (propertyValue.participants.size() > 0) {
      var newMatches = propertyValue.participants.map(function(it, i) {
        return { id: (propertyValue.matches.size() + i), a: { name: it, score: null }, b: { name: streamValue, score: null } }
      })
      propertyValue.matches = propertyValue.matches.union(newMatches.value())
    }
    propertyValue.participants.push(streamValue)
    return propertyValue
  })
  var resultUpdates = matchProp.sampledBy(resultStream, function(propertyValue, streamValue) {
    propertyValue.matches = propertyValue.matches.map(function(it) {
      if (it.a.name === streamValue.a.name && it.b.name === streamValue.b.name) {
        it.a.score = streamValue.a.score
        it.b.score = streamValue.b.score
      } else if (it.a.name === streamValue.b.name && it.b.name === streamValue.a.name) {
        it.a.score = streamValue.b.score
        it.b.score = streamValue.a.score
      }
      return it
    })
    return propertyValue
  })
  var participantRenames = matchProp.sampledBy(renameStream, function(propertyValue, streamValue) {
    propertyValue.participants = propertyValue.participants.map(function(it) {
      if (it === streamValue.from)
        return streamValue.to
      else
        return it
    })
    propertyValue.matches = propertyValue.matches.map(function(it) {
      if (it.a.name === streamValue.from) {
        it.a.name = streamValue.to
      } else if (it.b.name === streamValue.from) {
        it.b.name = streamValue.to
      }
      return it
    })
    return propertyValue
  })

  var result = Bacon.mergeAll([participantAdds, resultUpdates, participantRenames])
  result.throttle(10).onValue(function() { console.log('New state created'); console.log(arguments) })

  participantAdds.merge(resultUpdates).throttle(10).onValue(function(state) {
    $('.standings').replaceWith(templates.standings(participantStream, renameStream, makeStandings(state.participants, state.matches)))
  })

  $('<div class="standings"></div>').appendTo($container)
  var rounds = templates.rounds.appendTo($container)
  _([1, 2, 3, 4]).each(function(it) {
    rounds.append(Round.create(it).markup)
  })

  var unassigned = templates.unassigned.appendTo($container)
  participantRenames.merge(participantAdds).merge(resultUpdates).throttle(10).onValue(function(state) {
    var $matches = $('.match')
    state.matches.each(function(it) {
      var $match = $matches.filter('[data-id="'+it.id+'"]')
      if ($match.length)
        $match.replaceWith(Match.create(resultStream, it).markup)
      else
        unassigned.append(Match.create(resultStream, it).markup)
    })
  })

  participants.each(function(it) { participantStream.push(it) })
  pairs.each(function(it) { resultStream.push({ a: { name: it.home, score: it.homeScore }, b: { name: it.away, score: it.awayScore } }) })
})
