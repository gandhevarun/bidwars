// config/passport.js - Google + Facebook OAuth
const passport = require('passport');
const GoogleStrategy   = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try { done(null, await User.findById(id)); } catch(e) { done(e, null); }
});

if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('your_')) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.findOne({ email: profile.emails?.[0]?.value });
        if (user) {
          user.googleId = profile.id;
          await user.save({ validateBeforeSave: false });
        } else {
          user = await User.create({
            name:           profile.displayName,
            email:          profile.emails?.[0]?.value,
            googleId:       profile.id,
            authProvider:   'google',
            avatar:         profile.photos?.[0]?.value || '',
            isEmailVerified: true,
            role:           'buyer'
          });
        }
      }
      done(null, user);
    } catch(err) { done(err, null); }
  }));
  console.log('✅ Google OAuth enabled');
}

if (process.env.FACEBOOK_APP_ID && !process.env.FACEBOOK_APP_ID.includes('your_')) {
  passport.use(new FacebookStrategy({
    clientID:     process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL:  `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/facebook/callback`,
    profileFields: ['id','displayName','emails','photos']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ facebookId: profile.id });
      if (!user) {
        user = await User.create({
          name:           profile.displayName,
          email:          profile.emails?.[0]?.value || `fb_${profile.id}@bidwars.com`,
          facebookId:     profile.id,
          authProvider:   'facebook',
          avatar:         profile.photos?.[0]?.value || '',
          isEmailVerified: true,
          role:           'buyer'
        });
      }
      done(null, user);
    } catch(err) { done(err, null); }
  }));
  console.log('✅ Facebook OAuth enabled');
}

module.exports = passport;
