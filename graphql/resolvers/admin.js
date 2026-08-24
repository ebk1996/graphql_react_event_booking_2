const User = require('../../models/user');

const ADMIN_EMAIL = 'echolsbrysonkyle@gmail.com';

const requireAdmin = async (context) => {
  if (!context || !context.isAuth || !context.userId) {
    throw new Error('Administrator authentication required.');
  }

  const user = await User.findById(context.userId);

  if (!user || String(user.email).trim().toLowerCase() !== ADMIN_EMAIL) {
    throw new Error('Administrator access denied.');
  }

  if (user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }

  return user;
};

module.exports = {
  ADMIN_EMAIL,
  requireAdmin,
};
