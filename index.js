import mongoose from "mongoose";
import express from "express";
import session from "express-session";
import { sessionSecret } from "./config/config.js";
import dotenv from 'dotenv';

dotenv.config();

const { PORT, MONGODB_URI } = process.env;

mongoose.connect(MONGODB_URI);

const app = express();

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true
}));

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache');
    next();
});

app.set("view engine", "ejs");


import adminRoute from "./routes/adminRoute.js";
import CategoryRoute from "./routes/categoryRoute.js";
import productRoute from "./routes/productRoute.js";
import adminOrderRoute from "./routes/adminOrderRoute.js";
import offerRoute from "./routes/offerRoute.js";
import couponRoute from "./routes/couponRoute.js";
import bannerRoute from "./routes/bannerRoute.js";
import salesRoute from "./routes/salesRoute.js";

import userRoute from "./routes/userRoute.js";
import shopRoute from "./routes/shopeRoute.js";
import cartRoute from "./routes/cartRoute.js";
import wishlistRoute from "./routes/wishlistRoute.js";
import addressRoute from "./routes/addressRoute.js";
import checkoutRoute from "./routes/checkoutRoute.js";
import orderRoute from "./routes/orderRoute.js";
import walletRoute from "./routes/walletRoute.js";


app.use(express.static('public'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/admin", adminRoute, productRoute, CategoryRoute, adminOrderRoute, offerRoute, couponRoute, bannerRoute, salesRoute);

app.use("/", userRoute, shopRoute, cartRoute, wishlistRoute, addressRoute, checkoutRoute, orderRoute, walletRoute);

import { errorHandler } from "./middleware/errorHandler.js";

app.use(errorHandler);

app.get("/api/test", (_, res) => {
    res.status(200).json({ message: "ok" });
})

app.all("*", (req, res, next) => {
    res.render("user/error-404");
});

app.listen(PORT, () => {
    console.log(`server is running on port ${PORT}`);
});


