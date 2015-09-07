var gulp = require('gulp');
var browserify = require('browserify');

var uglify = require('gulp-uglify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var rename = require('gulp-rename');
var jshint = require('gulp-jshint');

var paths = {
    dest: 'build'
};

// ** Compilation ** //
gulp.task('default', ['build']);
gulp.task('build', function() {
    var b = browserify({
	entries: './js2glsl.js',
	standalone: 'js2glsl',
	debug: true
    });
  return b.bundle()
    .pipe(source('js2glsl.js'))
    .pipe(buffer())
    .pipe(gulp.dest(paths.dest))
    .pipe(uglify())
    .pipe(rename({ extname: '.min.js' }))
    .pipe(gulp.dest(paths.dest));
});

// ** Lint ** //
gulp.task('lint', function() {
    return gulp.src(['./*.js', './libs/*.js'])
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});
