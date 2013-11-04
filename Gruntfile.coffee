module.exports = (grunt) ->
  grunt.initConfig
    licenseString: '/* jQuery Group | Copyright (c) Teijo Laine <%= grunt.template.today("yyyy") %> | Licenced under the MIT licence */'
    pkg: grunt.file.readJSON("package.json")
    watch:
      scripts:
        files: ["src/jquery.group.sass", "src/jquery.group.coffee"]
        tasks: ["default"]

    compass:
      dist:
        options:
          sassDir: "src"
          cssDir: "dist"
          raw: "preferred_syntax = :sass\n"

    jshint:
      options:
        jshintrc: ".jshintrc"

      with_overrides:
        options:
          asi: true
          curly: false
          strict: false
          predef: ["jQuery", "console"]

        files:
          src: ["src/jquery.bracket.js"]

    coffee:
      compile:
        files:
          "dist/jquery.group.js": "src/jquery.group.coffee"

    cssmin:
      dist:
        files:
          "dist/<%= pkg.name %>.min.css": "dist/<%= pkg.name %>.css"
      options:
        banner: '<%= licenseString %>'

    uglify:
      options:
        compress: true
        banner: '<%= licenseString %>\n'

      dist:
        files:
          "dist/<%= pkg.name %>.min.js": ["dist/<%= pkg.name %>.js"]

  grunt.loadNpmTasks "grunt-contrib-coffee"
  grunt.loadNpmTasks "grunt-contrib-uglify"
  grunt.loadNpmTasks "grunt-contrib-watch"
  grunt.loadNpmTasks "grunt-contrib-jshint"
  grunt.loadNpmTasks "grunt-contrib-compass"
  grunt.loadNpmTasks "grunt-css"
  grunt.registerTask "default", ["compass", "coffee", "uglify", "cssmin"]
