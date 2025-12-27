const User = require('../models/User');

// @desc    Get user profile
// @route   GET /api/users/profile
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      joined: user.createdAt
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
const updateUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    
    // Only update password if sent
    if (req.body.password) {
      user.password = req.body.password; 
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      token: req.headers.authorization.split(' ')[1] // Return existing token
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
};

module.exports = { getUserProfile, updateUserProfile };