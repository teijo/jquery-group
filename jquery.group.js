function makeStandings(pairs) {
  var participants = pairs.pluck('home').union(pairs.pluck('away').value())
  return participants.map(function(it) {
    var matches = pairs
      .filter(function(match) { return match.home === it || match.away === it })
      .map(function(match) {
        if (match.home === it)
          return { ownScore: match.homeScore, opponentScore: match.awayScore }
        else
          return { ownScore: match.awayScore, opponentScore: match.homeScore }
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
      +'<tr><td><input value="{{name}}" /></td><td>{{wins}}</td><td>{{losses}}</td><td>{{ties}}</td><td>{{points}}</td></tr>'
      +'{{/each}}'
      +'</table>'
      +'</div>')
    var roundsMarkup = Handlebars.compile(
      '<div class="rounds"></div>')
    var unassignedMarkup = Handlebars.compile(
      '<div class="unassigned"></div>')
    return {
      standings: function(participants) { return $(standingsMarkup(participants.value())) },
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
      create: function(match) {
        return new function() {
          var that = this
          match.id = ++id
          var markup = $(template(match))
          this.markup = markup

          var scoreChanges = markup.find('input').asEventStream('change').map('.target').map($)

          this.property = Bacon.combineTemplate({
            home: match.home,
            homeScore: scoreChanges.filter('.hasClass', 'home')
              .map(function(it) { return it.val() })
              .toProperty(match.homeScore),
            away: match.away,
            awayScore: scoreChanges.filter('.hasClass', 'away')
              .map(function(it) { return it.val() })
              .toProperty(match.awayScore)
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

  $('<div class="standings"></div>').appendTo($container)
  var rounds = templates.rounds.appendTo($container)
  _([1, 2, 3, 4]).each(function(it) {
    rounds.append(Round.create(it).markup)
  })
  var unassigned = templates.unassigned.appendTo($container)
  var properties = []
  pairs.each(function(it) {
    var match = Match.create(it)
    properties.push(match.property)
    unassigned.append(match.markup)
  })
  var state = Bacon.combineAsArray(properties)
  state.onValue(function(val) {
    $('.standings').replaceWith(templates.standings(makeStandings(_(val))))
  })
})
