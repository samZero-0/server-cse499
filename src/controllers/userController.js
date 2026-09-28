const User = require('../models/User');

// Public shape of a user (never includes the password)
const toProfile = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone || '',
  address: user.address || '',
  city: user.city || '',
  joined: user.createdAt,
});

// @desc    Get user profile
// @route   GET /api/users/profile
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(toProfile(user));
};

// @desc    Update user profile (name, email, password, delivery details)
// @route   PUT /api/users/profile
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, email, password, phone, address, city } = req.body;

    if (email && email !== user.email) {
      const taken = await User.findOne({ email });
      if (taken) return res.status(400).json({ message: 'That email is already in use' });
      user.email = email;
    }
    if (name) user.name = name;
    // Delivery details can be cleared, so accept empty strings
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (city !== undefined) user.city = city;
    if (password) user.password = password;

    const updatedUser = await user.save();

    res.json({
      ...toProfile(updatedUser),
      token: req.headers.authorization.split(' ')[1], // Return existing token
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ message: 'Could not update profile' });
  }
};

module.exports = { getUserProfile, updateUserProfile, toProfile };
