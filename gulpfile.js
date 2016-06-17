/**
 * Created by allen.hu on 15/8/20.
 */
'use strict';
var path = require('path'),
    gulp = require('gulp'),
    sourcemaps = require("gulp-sourcemaps"),
    babel = require('gulp-babel');

var src = path.resolve(process.cwd(), 'src', '*.js');
var dest = path.resolve(process.cwd(), 'lib');

gulp.task('default', function() {
    return gulp
        .src(src)
        .pipe(sourcemaps.init())
        .pipe(babel())
        .pipe(gulp.dest(dest))
});