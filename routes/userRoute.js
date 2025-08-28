import express from "express";

const user_route = express();

user_route.set("view engine", "ejs");
user_route.set("views", "./views/user");

import { isLogin, isLogout } from "../middleware/auth.js";
import { isBlocked } from "../middleware/isBlocked.js";
import { loadhome, loadLogin, loadRegister, verfyLogin, loadResetPasswordLink, verifyResetPasswordEmail, resetPassword, sendOTP, verifyOTP, resendOTP, logout, loadProfile, editUser, changePassword, loadResetPassword,loadCoupons} from "../controllers/userController.js";


user_route.get("/", isBlocked, loadhome);

user_route.get("/login", isLogout, loadLogin);

user_route.get("/password/reset-link", loadResetPasswordLink);

user_route.post("/password/reset-link", verifyResetPasswordEmail);

user_route.get("/password/reset", loadResetPassword);

user_route.post("/password/reset", resetPassword);

user_route.get("/register", isLogout, loadRegister);

user_route.post("/register", isLogout, sendOTP);

user_route.post("/otp/verification", isLogout, verifyOTP);

user_route.post("/otp/resend", isLogout, resendOTP);

user_route.post("/login", isLogout, verfyLogin);

user_route.get("/logout", isLogin, logout);

user_route.get("/profile", isBlocked, isLogin, loadProfile);

user_route.patch("/user", isBlocked, isLogin, editUser);

user_route.patch("/password", isBlocked, isLogin, changePassword);

user_route.get("/coupons", isBlocked, isLogin,loadCoupons);


export default user_route;