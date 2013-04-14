(function($) {
  var numberRe = new RegExp(/^[0-9]+$/)

  function toIntOrNull(string) {
    if (!numberRe.test(string))
      return null
    var value = parseInt(string)
    return isNaN(value) ? null : value
  }

  function evTarget(ev) {
    return $(ev.target)
  }

  function evElTarget(ev) {
    return [ev, evTarget(ev)]
  }

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

  var group = function($container, participants, pairs, onchange) {
    if (onchange)
      $container.addClass('read-write')

    var templates = (function() {
      var readOnlyMarkup = Handlebars.compile(
        '<div class="standings">'
        +'Standings'
        +'<table>'
        +'<colgroup>'
        +'<col style="width: 60%">'
        +'<col span="4" style="width: 10%">'
        +'</colgroup>'
        +'<tr><th>Name</th><th>W</th><th>L</th><th>T</th><th>P</tr>'
        +'{{#each this}}'
        +'<tr><td>{{name}}</td><td>{{wins}}</td><td>{{losses}}</td><td>{{ties}}</td><td>{{points}}</td></tr>'
        +'{{/each}}'
        +'</table>'
        +'</div>')
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
        +'<tr><td><input class="name" type="text" data-prev="{{name}}" value="{{name}}" /></td><td>{{wins}}</td><td>{{losses}}</td><td>{{ties}}</td><td>{{points}}</td></tr>'
        +'{{/each}}'
        +'<tr><td><input class="add" type="text" value="{{name}}" /></td><td colspan="4"><input type="submit" value="Add" disabled="disabled" /></td></tr>'
        +'</table>'
        +'</div>')
      var roundsMarkup = Handlebars.compile(
        '<div class="rounds"></div>')
      var unassignedMarkup = Handlebars.compile(
        '<div class="unassigned"><header>Unassigned</header></div>')
      return {
        standings: function(participantStream, renameStream, participants) {
          participants = participants || _([])
          if (!onchange)
            return $(readOnlyMarkup(participants.value()))
          var markup = $(standingsMarkup(participants.value()))
          var $submit = markup.find('input[type=submit]')

          var keyUps = markup.find('input').asEventStream('keyup')
            .map(evTarget)
            .map(function($el) {
              var value = $el.val()
              var previous = $el.attr('data-prev')
              var valid = value.length > 0 && (!participants.pluck('name').contains(value) || previous === value)
              console.log(valid)
              return { el: $el, value: value, valid: valid }
            }).toProperty()

          keyUps.onValue(function(state) {
            state.el.toggleClass('conflict', !state.valid)
            if (state.el.hasClass('add')) {
              if (state.valid)
                $submit.removeAttr('disabled')
              else
                $submit.attr('disabled', 'disabled')
            }
          })

          var isValid = keyUps.map(function(state) { return state.valid }).toProperty()

          markup.find('input.name').asEventStream('change')
            .filter(isValid)
            .map('.target')
            .map($)
            .onValue(function(el) {
              renameStream.push({ from: el.attr('data-prev'), to: el.val() })
              el.attr('data-prev', el.val())
            })

          markup.find('input.add').asEventStream('change')
            .filter(isValid)
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
        '<div data-roundId="{{round}}" class="round" style="width: {{width}}%"><header>Round {{round}}</header></div>')

      return {
        create: function(moveStream, round, roundCount) {
          return new function() {
            var r = $(template({ round: round, width: 100 /*(100 / roundCount)*/ }))
            this.markup = r

            if (!onchange)
              return

            r.asEventStream('dragover').doAction('.preventDefault').onValue(function(ev) { })
            r.asEventStream('dragenter').doAction('.preventDefault').map(evTarget).onValue(function($el) { $el.addClass('over') })
            r.asEventStream('dragleave').doAction('.preventDefault').map(evTarget).onValue(function($el) { $el.removeClass('over') })
            r.asEventStream('drop').doAction('.preventDefault')
              .map(evElTarget)
              .onValues(function(ev, $el) {
                var id = ev.originalEvent.dataTransfer.getData('Text')
                var obj = $container.find('[data-matchId="'+id+'"]')
                $el.append(obj)
                $el.removeClass('over')
                moveStream.push({ match: parseInt(id), round: parseInt($el.attr('data-roundId')) })
              })
          }
        }
      }
    })()

    var Match = (function() {
      var id = 0
      var readOnlyTemplate = Handlebars.compile(
        '<div data-matchId="{{id}}" class="match" draggable="{{draggable}}">'
        +'<span class="home">{{a.name}}</span>'
        +'<div class="home">{{a.score}}</div>'
        +'<span class="away">{{b.name}}</span>'
        +'<div class="away">{{b.score}}</div>'
        +'</div>')

      var template = Handlebars.compile(
        '<div data-matchId="{{id}}" class="match" draggable="{{draggable}}">'
        +'<span class="home">{{a.name}}</span>'
        +'<input type="text" class="home" value="{{a.score}}" />'
        +'<span class="away">{{b.name}}</span>'
        +'<input type="text" class="away" value="{{b.score}}" />'
        +'</div>')

      return {
        create: function(resultStream, match) {
          return new function() {
            var that = this
            match = $.extend({}, match)
            match.draggable = (onchange != null).toString()

            if (!onchange) {
              this.markup = $(readOnlyTemplate(match))
              return
            }

            var markup = $(template(match))
            this.markup = markup

            var keyUps = markup.find('input').asEventStream('keyup')
              .map(evTarget)
              .onValue(function($el) {
                $el.toggleClass('conflict', toIntOrNull($el.val()) === null)
              })

            markup.find('input').asEventStream('change').onValue(function() {
              var scoreA = toIntOrNull(markup.find('input.home').val())
              var scoreB = toIntOrNull(markup.find('input.away').val())
              if (scoreA === null || scoreB === null)
                return
              var update = { a: { name: match.a.name, score: scoreA },
                             b: { name: match.b.name, score: scoreB } }
              resultStream.push(update)
            })

            markup.asEventStream('dragstart').map(".originalEvent").map(evElTarget).onValues(function(ev, $el) {
              ev.dataTransfer.setData('Text', match.id)
              $el.css('opacity', 0.5)
              $container.find('.round').addClass('droppable')
            })

            markup.asEventStream('dragend').map(".originalEvent").map(evElTarget).onValues(function(ev, $el) {
              $el.css('opacity', 1.0)
              $container.find('.round').removeClass('droppable')
            })
          }
        }
      }
    })()

    var matchStream = new Bacon.Bus()
    var participantStream = new Bacon.Bus()
    var renameStream = new Bacon.Bus()
    var resultStream = new Bacon.Bus()
    var moveStream = new Bacon.Bus()

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
          it.round = streamValue.round
          it.a.score = streamValue.a.score
          it.b.score = streamValue.b.score
        } else if (it.a.name === streamValue.b.name && it.b.name === streamValue.a.name) {
          it.round = streamValue.round
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
    var participantMoves = matchProp.sampledBy(moveStream, function(propertyValue, streamValue) {
      propertyValue.matches = propertyValue.matches.map(function(it) {
        if (it.id === streamValue.match)
          it.round = streamValue.round
        return it
      })
      return propertyValue
    })

    var result = Bacon.mergeAll([participantAdds, resultUpdates, participantRenames, participantMoves])
    result.throttle(10).onValue(function(state) {
      console.log('New state created');
      console.log(state);
      if (onchange)
        onchange(state.matches.value())
    })

    participantAdds.merge(resultUpdates).throttle(10).onValue(function(state) {
      $container.find('.standings').replaceWith(templates.standings(participantStream, renameStream, makeStandings(state.participants, state.matches)))
    })

    var $standings = $('<div class="standings"></div>').appendTo($container)
    $standings.replaceWith(templates.standings(participantStream))

    var rounds = templates.rounds.appendTo($container)
    // 2n teams -> n-1 rounds, 2n+1 teams -> n rounds
    var roundCount = participants.size() - 1 + (participants.size() % 2)
    _(_.range(roundCount)).each(function(it) {
      rounds.append(Round.create(moveStream, it+1, roundCount).markup)
    })

    var unassigned = templates.unassigned.appendTo($container)
    participantRenames.merge(participantAdds).merge(resultUpdates).throttle(10).onValue(function(state) {
      var $matches = $container.find('.match')
      state.matches.each(function(it) {
        var $match = $matches.filter('[data-matchId="'+it.id+'"]')
        if ($match.length)
          $match.replaceWith(Match.create(resultStream, it).markup)
        else if (it.round)
          $container.find('div.round').filter('[data-roundId="'+it.round+'"]').append(Match.create(resultStream, it).markup)
        else
          unassigned.append(Match.create(resultStream, it).markup)
      })
    })

    participants.each(function(it) { participantStream.push(it) })
    pairs.each(function(it) { resultStream.push(it) })
  }

  var methods = {
    init: function(opts) {
      opts = opts || {}
      var container = this
      var pairs = _(opts.pairs)
      var participants = pairs.pluck('a').union(pairs.pluck('b').value()).pluck('name').unique()
      return new group($('<div class="jqgroup"></div>').appendTo(container),
                       participants,
                       pairs,
                       opts.onchange || null)
    }
  }

  $.fn.group = function(method) {
    if (methods[method]) {
      return methods[method].apply(this, Array.prototype.slice.call(arguments, 1))
    } else if (typeof method === 'object' || !method) {
      return methods.init.apply(this, arguments)
    } else {
      $.error('Method '+ method+' does not exist on jQuery.group')
    }
  }
})(jQuery)
