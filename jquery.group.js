function makeStandings(participants, pairs) {
  return participants.map(function(it) {
    var matches = pairs
      .filter(function(match) { return match[0].name === it || match[1].name === it })
      .map(function(match) {
        if (match[0].name === it)
          return { ownScore: match[0].score, opponentScore: match[1].score }
        else
          return { ownScore: match[1].score, opponentScore: match[0].score }
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
      +'<tr><td><input class=="name" value="{{name}}" /></td><td>{{wins}}</td><td>{{losses}}</td><td>{{ties}}</td><td>{{points}}</td></tr>'
      +'{{/each}}'
      +'</table>'
      +'<input class="add" value="{{name}}" /><input type="submit" value="Add" />'
      +'</div>')
    var roundsMarkup = Handlebars.compile(
      '<div class="rounds"></div>')
    var unassignedMarkup = Handlebars.compile(
      '<div class="unassigned"></div>')
    return {
      standings: function(participantStream, participants) {
        var markup = $(standingsMarkup(participants.value()))
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
          r.asEventStream('dragenter').doAction('.preventDefault').onValue(function(ev) {
            r.addClass('over')
          })
          r.asEventStream('dragleave').doAction('.preventDefault').onValue(function(ev) {
            r.removeClass('over')
          })
          r.asEventStream('drop').doAction('.preventDefault').onValue(function(ev) {
            var id = ev.originalEvent.dataTransfer.getData('Text')
            var obj = $('[data-id="'+id+'"]')
            $(ev.target).append(obj)
            r.removeClass('over')
          })
        }
      }
    }
  })()

  var Match = (function() {
    var id = 0
    var template = Handlebars.compile(
      '<div data-id="{{id}}" class="match" draggable="true">'
      +'<span class="home">{{home}}</span>'
      +'<input class="home" value="{{homeScore}}" />'
      +'<input class="away" value="{{awayScore}}" />'
      +'<span class="away">{{away}}</span>'
      +'</div>')

    return {
      create: function(resultStream, match) {
        return new function() {
          var that = this
          match.id = ++id
          var markup = $(template(match))
          this.markup = markup

          var scoreChanges = markup.find('input').asEventStream('change').map('.target').map($)

          this.property = Bacon.combineTemplate({
            homeScore: scoreChanges.filter('.hasClass', 'home')
              .map(function(it) { return it.val() })
              .toProperty(match.homeScore),
            awayScore: scoreChanges.filter('.hasClass', 'away')
              .map(function(it) { return it.val() })
              .toProperty(match.awayScore)
          })

          this.property.onValue(function(result) {
            resultStream.push([ { name: match.home, score: result.homeScore }, { name: match.away, score: result.awayScore } ])
          })

          markup.asEventStream('dragstart').map(".originalEvent").onValue(function(ev) {
            ev.dataTransfer.setData('Text', match.id)
            markup.css('opacity', 0.5)
            $('.round').addClass('droppable')
          })

          markup.asEventStream('dragend').map(".originalEvent").onValue(function(ev) {
            markup.css('opacity', 1.0)
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
      var newMatches = propertyValue.participants.map(function(it) {
        return [ { name: it, score: null }, { name: streamValue, score: null } ]
      })
      propertyValue.matches = propertyValue.matches.union(newMatches.value())
    }
    propertyValue.participants.push(streamValue)
    return propertyValue
  })
  var resultUpdates = matchProp.sampledBy(resultStream, function(propertyValue, streamValue) {
    propertyValue.matches = propertyValue.matches.map(function(it) {
      if (it[0].name === streamValue[0].name && it[1].name === streamValue[1].name) {
        it[0].score = streamValue[0].score
        it[1].score = streamValue[1].score
      } else if (it[0].name === streamValue[1].name && it[1].name === streamValue[0].name) {
        it[0].score = streamValue[1].score
        it[1].score = streamValue[0].score
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
      if (it[0].name === streamValue.from) {
        it[0].name = streamValue.to
      } else if (it[1].name === streamValue.from) {
        it[1].name = streamValue.to
      }
      return it
    })
    return propertyValue
  })

  var result = Bacon.mergeAll([participantAdds, resultUpdates, participantRenames])
  result.throttle(10).onValue(function() { console.log('New state created'); console.log(arguments) })

  participants.each(function(it) { participantStream.push(it) })

  //renameStream.push({ from: 'b', to: 'e' })

  resultUpdates.throttle(10).onValue(function(state) {
    $('.standings').replaceWith(templates.standings(participantStream, makeStandings(state.participants, state.matches)))
  })

  $('<div class="standings"></div>').appendTo($container)
  var rounds = templates.rounds.appendTo($container)
  _([1, 2, 3, 4]).each(function(it) {
    rounds.append(Round.create(it).markup)
  })
  var unassigned = templates.unassigned.appendTo($container)
  pairs.each(function(it) {
    unassigned.append(Match.create(resultStream, it).markup)
  })
})
