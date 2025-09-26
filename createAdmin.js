const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/education_platform', { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
})
  .then(async () => {
    console.log('MongoDB connected for admin creation');


    let existingAdmin = await Admin.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('Admin already exists. Current password hash:', existingAdmin.password);
      process.exit(0);
    }

    const newAdmin = new Admin({
      username: 'admin',
      password: 'admin' 
    });

    await newAdmin.save();
    console.log('Admin created successfully!');
    console.log('Username: admin');
    console.log('Password: admin');
    console.log('Please change the password after first login for security.');

    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Error creating admin:', err);
    mongoose.connection.close();
  });