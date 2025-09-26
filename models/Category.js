const mongoose = require('mongoose');
//-----------------------------------
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true, 
    trim: true
  },
  tags: {
    type: [String],
    default: []
  },
  description: {
    type: String,
    default: ''
  },
  displayOrder: {
    type: Number,
    required: true
  }
}, { timestamps: true });
//---------------------------------
module.exports = mongoose.model('Category', categorySchema);