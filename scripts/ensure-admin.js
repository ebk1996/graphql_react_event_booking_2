const mongoose = require('mongoose');
const User = require('../models/user');

const ADMIN_EMAIL = 'echolsbrysonkyle@gmail.com';

(async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL;

  if (!uri) {
    throw new Error(
      'No Mongo connection variable found. Expected MONGODB_URI, MONGO_URI, MONGO_URL, or DATABASE_URL.'
    );
  }

  await mongoose.connect(uri);

  const admin = await User.findOne({
    email: ADMIN_EMAIL,
  });

  if (!admin) {
    console.log(
      `ADMIN ACCOUNT NOT FOUND: ${ADMIN_EMAIL}`
    );
    console.log(
      'Create/login to this account first, then rerun this script.'
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  await User.updateMany(
    {
      email: {
        $ne: ADMIN_EMAIL,
      },
      role: 'ADMIN',
    },
    {
      $set: {
        role: 'USER',
      },
    }
  );

  admin.role = 'ADMIN';
  await admin.save();

  console.log(`ONLY ADMIN: ${ADMIN_EMAIL}`);
  console.log('All other ADMIN roles revoked.');

  await mongoose.disconnect();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
