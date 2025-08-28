import User from "../models/userModel.js";
import OTP from "../models/otpModel.js";
import Products from "../models/productsModel.js";
import Cart from "../models/cartModel.js";
import Coupons from "../models/couponModel.js";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import dotenv from 'dotenv';

dotenv.config();

const { APP_EMAIL_ID, APP_PASSWORD, BASE_URL } = process.env;


const securePassword = async (password) => {
    try {
        const passwordHash = bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.log(error.message);
    }
}


const loadhome = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cart ? cart.items.length : 0;

        const topDeals = await Products.aggregate([
            {
                $addFields: {
                    priceDifference: { $subtract: ["$price", "$offer_price"] }
                }
            },
            {
                $sort: { priceDifference: -1 }
            },
            {
                $limit: 4
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $unwind: "$category"
            }
        ]);

        const newArrivals = await Products.find({}).populate("category").sort({ createdAt: -1 }).limit(4);

        res.render("home", { user: userData, topDeals, newArrivals, cartCount: cartItemCount });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const loadLogin = async (req, res, next) => {
    try {
        res.render("login");

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const loadRegister = async (req, res, next) => {
    try {
        const referralCode = req.query.referral_code;
        req.session.referral_code = referralCode;
        console.log("referral_code:", req.session.referral_code);
        console.log(referralCode);
        res.render('register');

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const verfyLogin = async (req, res, next) => {
    try {

        const { email, password } = req.body;
        const userData = await User.findOne({ email: email });
        const users = await User.find({})
        console.log(users);

        if (!userData) {
            console.log('User not found !');
            return res.status(404).json({ message: "Email or Password is incorrect." });
        }

        if (userData.is_block) {
            console.log('User is blocked !');
            return res.status(403).json({ message: "You have been blocked" });
        }

        if (userData) {
            const passwordMatch = await bcrypt.compare(password, userData.password);
            console.log("hello");

            if (passwordMatch) {
                req.session._id = userData._id;
                res.status(200).json({ success: true });

            } else {
                res.status(400).json({ success: false, message: "Incorrect Password." });
            }

        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const loadResetPasswordLink = async (req, res, next) => {
    try {
        res.render('reset-password-link');
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const sentResetLink = async (username, email, token) => {

    try {
        let transporter = nodemailer.createTransport({
            service: "gmail",
            host: 'smtp.gmail.com',
            port: 587,
            secure: true,
            auth: {
                user: APP_EMAIL_ID,
                pass: APP_PASSWORD
            }
        });

        const resetLink = `${BASE_URL}/password/reset?token=${token}`;
        console.log("link :", resetLink)

        const mailOptions = {
            from: APP_EMAIL_ID,
            to: email,
            subject: "Password Reset Request",
            html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; background-color: #f9f9f9; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
            <h1 style="color: #3498db; text-align: center;">StepEx</h1>
            <h5 style="text-align: center; font-size: 18px;">Hi ${username},</h5>
            <p style="text-align: center; font-size: 16px;">We have received a request to reset your password.If this wasn't initiated by you, please ignore this email.</p>
            <p style="text-align: center; font-size: 16px;">To reset your password, click the link below:</p>
            <p style="text-align: center; font-size: 16px;"><a href='${resetLink}' style="color: #2ecc71; text-decoration: none;">Reset Your Password</a></p>
            <p style="text-align: center; font-size: 16px;">This link will expire in 1 hour for security reasons.</p>
            <p style="text-align: center; font-size: 16px;">If you did not request a password reset or have any concerns, please contact our support team immediately.</p>
            <p style="text-align: center; font-size: 16px; margin: 20px 0;">Best regards,<br>StepEx</p>
          </div>
        `,
        };

        await transporter.sendMail(mailOptions);

    } catch (error) {
        console.log("Email send error:", error.message);
        throw error;
    }
};


const generateVerificationToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const verifyResetPasswordEmail = async (req, res, next) => {
    try {
        const { email } = req.body;
        console.log("email :", email);
        const userData = await User.findOne({ email: email });

        if (!userData) {
            return res.status(404).json({ message: 'User not found' });
        }

        const token = generateVerificationToken();

        await User.updateOne(
            { email: email },
            { $set: { token: token } }
        );

        await sentResetLink(userData.name, userData.email, token);

        res.status(200).json({ success: true });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};


const loadResetPassword = async (req, res, next) => {

    try {
        const { token } = req.query;
        console.log(token);
        const userData = await User.findOne({ token: token });
        console.log(userData);
        res.render("reset-password", { userId: userData._id });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const resetPassword = async (req, res, next) => {

    try {
        const { userId, newPassword } = req.body;
        console.log(newPassword, userId);

        const password = await securePassword(newPassword);
        await User.findByIdAndUpdate({ _id: userId }, { $set: { password: password } });

        res.status(200).json({ success: true, message: "Your Password has been updated successfully!" })

    } catch (error) {
        console.log(error.message);
        next(error);
    }
}


const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000);
};

const sendOTP = async (req, res, next) => {
    try {

        const { email } = req.body;

        const existingUserWithEmail = await User.findOne({ email: email });

        if (existingUserWithEmail) {

            res.render("register", { email: req.body.email, name: req.body.name, mobile: req.body.mno, message: "User with the same email address already exists" });

        } else {

            const Otp = generateOTP();
            console.log("Otp:", Otp)

            const spassword = await securePassword(req.body.password);

            req.session.name = req.body.name;
            req.session.email = req.body.email;
            req.session.mobile = req.body.mno;
            req.session.password = spassword;

            const otp = new OTP({
                email: req.session.email,
                OTP: Otp
            });

            const otpData = await otp.save()

            let transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: APP_EMAIL_ID,
                    pass: APP_PASSWORD
                }
            });

            let mailOptions = {
                from: '"Rafi" <rafikp@gmail.com>',
                to: req.session.email,
                subject: "Verify ",
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="text-align: center; color:#3498db;">OTP Verification</h2>
                <p style="text-align: center;">Please use the following OTP to verify your email:</p>
                <div style="text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 20px;color: #2ecc71;"> ${Otp}</div>
                <p style="text-align: center;">This OTP is valid for 2 minutes.</p>
                <p style="text-align: center;">If you did not request this OTP, please ignore this message.</p>
                <p style="text-align: center;">Best regards,<br>StepEx</p>
              </div>`
            };

            await transporter.sendMail(mailOptions);

            res.render("verify-otp");
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};


const resendOTP = async (req, res, next) => {

    try {
        const Otp = generateOTP();
        console.log(Otp);

        await OTP.findOneAndUpdate(
            { email: req.session.email },
            { OTP: Otp, expireAt: Date.now() },
            { upsert: true, new: true }
        );

        let transporter = nodemailer.createTransport({
            service: "gmail",
            host: 'smtp.gmail.com',
            port: 587,
            secure: true,
            auth: {
                user: 'rafikpmty@gmail.com',
                pass: 'gxbwbnicdhrdkcsi'
            }
        });


        let mailOptions = {
            from: '"Rafi" <rafikp@gmail.com>',
            to: req.session.email,
            subject: 'Hello ✔',
            text: 'Hello world?',
            html: `<b>Your OTP is : ${Otp}</b>`
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'OTP sent successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const loadVerifyOTP = async (req, res, next) => {
    try {
        res.render("verify-otp");

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const generateReferral = () => {
    return Math.random().toString(36).substring(2, 15);
}

const verifyOTP = async (req, res, next) => {
    try {
        const { otp } = req.body;
        const { email } = req.session;

        const otpData = await OTP.findOne({ email: email, OTP: otp });
        const referralCode = generateReferral();

        if (otpData) {

            if (otpData.OTP == otp) {

                const user = new User({
                    name: req.session.name,
                    email: req.session.email,
                    mobile: req.session.mobile,
                    password: req.session.password,
                    referral_code: referralCode,
                    referred_code: req.session.referral_code,
                    is_block: 0
                });
                await user.save();
                delete req.session.name;
                delete req.session.email;
                delete req.session.mobile;
                delete req.session.password;

                console.log("OTP is correct");

                res.status(201).json({ message: "Registration successful..!" });

                console.log("OTP is correct 2");

            } else {

                return res.status(404).json({ message: "Incorrect OTP" });
            }

        } else {

            return res.status(404).json({ message: "Incorrect OTP" });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};


const logout = async (req, res, next) => {

    try {
        delete req.session._id;
        res.redirect("/");

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const loadProfile = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');

        const cartItemCount = cart ? cart.items.length : 0;

        res.render("userProfile", { user: userData, cartCount: cartItemCount });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const editUser = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const { name, mobile } = req.body;
        console.log(name, "edit");

        await User.findByIdAndUpdate(
            { _id: userId },
            { $set: { name: name, mobile: mobile } }
        )

        res.status(200).json({ message: 'User information updated successfully.' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};


const changePassword = async (req, res, next) => {

    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.session._id;

        const userData = await User.findOne({ _id: userId });
        const passwordMatch = await bcrypt.compare(currentPassword, userData.password);

        if (passwordMatch) {

            const password = await securePassword(newPassword);
            await User.findByIdAndUpdate({ _id: userId }, { $set: { password: password } });
            res.status(200).json({ message: "Your Password has been updated successfully!" })
        } else {
            res.status(400).json({ message: "Invalid Password" });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};


const loadCoupons = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const couponsData = await Coupons.find({ is_active: true });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');

        const cartItemCount = cart ? cart.items.length : 0;

        res.render("coupons", { user: userData, coupons: couponsData, cartCount: cartItemCount });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


export {
    loadhome,
    loadLogin,
    loadRegister,
    loadVerifyOTP,
    verfyLogin,
    loadResetPasswordLink,
    verifyResetPasswordEmail,
    loadResetPassword,
    resetPassword,
    sendOTP,
    resendOTP,
    verifyOTP,
    logout,
    loadProfile,
    editUser,
    changePassword,
    loadCoupons
}