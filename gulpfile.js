var gulp = require('gulp');
var browserify = require('browserify');
var tsc = require('gulp-tsc');
var shell = require('gulp-shell');
var runseq = require('run-sequence');
var tslint = require('gulp-tslint');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');

var paths = {    
    dest: 'build'
};

// ** Compilation ** //

gulp.task('build', function() {
    var b = browserify({
	entries: './js2glsl.js',
	standalone: 'js2glsl'
    }); 
  return b.bundle()
    .pipe(source('js2glsl.bundle.js'))
    .pipe(buffer())
    .pipe(gulp.dest(paths.dest))
    .pipe(uglify())
    .pipe(rename({ extname: '.min.js' }))
    .pipe(gulp.dest(paths.dest));
});
