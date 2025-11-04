// app.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const yaml = require('yamljs');
const path = require('path'); 
//------------------------------------
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admins');
const categoryRoutes = require('./routes/categories');
const courseRoutes = require('./routes/courses');
const articleRoutes = require('./routes/articles');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const discountRoutes = require('./routes/discounts');
const subscriptionRoutes = require('./routes/subscriptions');
const homepageRoutes = require('./routes/homepage');
const basketRoutes = require('./routes/basket');
const podcastRoutes = require('./routes/podcasts');
const notificationRoutes = require('./routes/notifications');
const courseDetailRoutes = require('./routes/courseDetail');


dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger
const swaggerDocument = yaml.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/homepage', homepageRoutes);
app.use('/api/basket', basketRoutes);
app.use('/api/podcasts', podcastRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/course', courseDetailRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Base URL: ${process.env.BASE_URL}`);
});