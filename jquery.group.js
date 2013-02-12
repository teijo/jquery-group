$(function() {
  var participants = _(["a", "b", "c", "d", "e"])
  var pairs = participants.map(function(it, i) {
    return participants.filter(function(_, j) { return j < i }).map(function(it2) {
      return [it, it2]
    }).value()
  }).flatten(true)
  console.log(pairs)
  var $container = $('<div class="jqgroup"></div>').appendTo('#container')
  var templates = (function() {
    var standingsMarkup = Handlebars.compile(
      '<div class="standings">Standings</div>')
    var roundsMarkup = Handlebars.compile(
      '<div class="rounds"></div>')
    var unassignedMarkup = Handlebars.compile(
      '<div class="unassigned"></div>')
    var participantMarkup = Handlebars.compile(
      '<div class="participant">{{this}}</div>')
    var matchMarkup = Handlebars.compile(
      '<div class="match">{{home}} - {{away}}</div>')
    var roundMarkup = Handlebars.compile(
      '<div class="round">Round {{this}}</div>')
    return {
      standings: $(standingsMarkup()),
      rounds: $(roundsMarkup()),
      unassigned: $(unassignedMarkup()),
      participant: function(p) { return $(participantMarkup(p)) },
      match: function(match) { return $(matchMarkup(match)) },
      round: function(round) { return $(roundMarkup(round)) }
    }
  })()
  var standings = templates.standings.appendTo($container)
  participants.each(function(it) {
    standings.append(templates.participant(it))
  })
  var rounds = templates.rounds.appendTo($container)
  _([1, 2, 3, 4]).each(function(it) {
    rounds.append(templates.round(it))
  })
  var unassigned = templates.unassigned.appendTo($container)
  pairs.each(function(it) {
    unassigned.append(templates.match({ home: it[0], away: it[1] }))
  })
})
