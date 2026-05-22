const mongoose = require("mongoose");

const connectMongo = async () => {

  try {

    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      "✅ MongoDB Connected"
    );

  } catch (error) {

    console.log(
      "❌ MongoDB Connection Failed"
    );

    console.log(
      error.message
    );

    process.exit(1);

  }

};

module.exports = connectMongo;
