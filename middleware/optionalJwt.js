const passport = require('passport');

module.exports = function optionalJwt(req, res, next) {
  passport.authenticate('jwt', { session: false }, (error, user) => {
    if (!error && user) req.user = user;
    next();
  })(req, res, next);
};
