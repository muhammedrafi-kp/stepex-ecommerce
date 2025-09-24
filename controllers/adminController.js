import Admin from "../models/adminModel.js";
import User from "../models/userModel.js";
import Order from "../models/orderModel.js";
import products from "../models/productOfferModel.js";
import bcrypt from "bcrypt";


const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10)
        return passwordHash;
    } catch (error) {
        console.log(error.message)
    }
}

const loadLogin = async (req, res, next) => {
    try {
        res.render("login")
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadDashboard = async (req, res, next) => {
    try {
        console.log("loadDashboard");
        const { timePeriod } = req.query;
        let startDate, endDate;

        console.log(timePeriod);
        let timePeriods = ["Today", "Last Week", "Last Month", "This Year"]
        let currentPeriod = timePeriod;

        const currentDate = new Date();
        if (!timePeriod || timePeriod === 'Today') {
            startDate = new Date(currentDate.setHours(0, 0, 0, 0));
            endDate = new Date(currentDate.setHours(23, 59, 59, 999));
            currentPeriod = "Today";

        } else if (timePeriod === 'Last Week') {
            const firstDayOfWeek = currentDate.getDate() - currentDate.getDay();
            startDate = new Date(currentDate.setDate(firstDayOfWeek));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(currentDate.setDate(firstDayOfWeek + 6));
            endDate.setHours(23, 59, 59, 999);

        } else if (timePeriod === 'Last Month') {
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        } else if (timePeriod === 'This Year') {
            startDate = new Date(currentDate.getFullYear(), 0, 1);
            endDate = new Date(currentDate.getFullYear(), 11, 31);
        }

        const salesData = await Order.find({
            date: { $gte: startDate, $lte: endDate },
            'items.status': { $nin: ["Cancelled", "Returned"] }
        });

        let xValues = [];
        let yValues = [];

        if (!timePeriod || timePeriod === 'Today') {
            xValues.push(currentDate.getDate());
            yValues.push(salesData.reduce((total, order) => total + order.totalAmount, 0));

        } else if (timePeriod === 'Last Week' || timePeriod === 'Last Month') {
            const daysInPeriod = (timePeriod === 'Last Week') ? 7 : new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
            for (let i = 0; i < daysInPeriod; i++) {
                const currentPeriodDate = new Date(startDate);
                currentPeriodDate.setDate(startDate.getDate() + i);
                xValues.push(currentPeriodDate.getDate());
                const totalAmount = salesData.filter(order => new Date(order.date).getDate() === currentPeriodDate.getDate())
                    .reduce((total, order) => total + order.totalAmount, 0);
                yValues.push(totalAmount);
            }

        } else if (timePeriod === 'This Year') {
            for (let i = 0; i < 12; i++) {
                const currentMonth = new Date(currentDate.getFullYear(), i, 1);
                xValues.push(currentMonth.toLocaleString('default', { month: 'short' }));
                const totalAmount = salesData.filter(order => new Date(order.date).getMonth() === i)
                    .reduce((total, order) => total + order.totalAmount, 0);
                yValues.push(totalAmount);
            }
        }

        const sales = await Order.aggregate([
            { $unwind: "$items" },
            { $match: { "items.status": { $nin: ["Cancelled", "Returned"] } } },
            {
                $lookup: {
                    from: "products",
                    localField: "items.product_id",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            { $sort: { date: -1 } },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $subtract: [
                                { $multiply: [{ $toDouble: "$items.price" }, { $toInt: "$items.quantity" }] },
                                { $ifNull: ["$discount", 0] }
                            ]
                        }
                    },
                    totalSalesCount: { $sum: 1 } // Count each item as a sale
                }
            }
        ]);

        const revenue = sales[0] ? sales[0].totalRevenue : 0;
        const totalSalesCount = sales[0] ? sales[0].totalSalesCount : 0;

        const totalUsersCount = await User.countDocuments({});


        const bestSellingProducts = await Order.aggregate([
            { $unwind: "$items" },
            { $match: { "items.status": { $nin: ["Cancelled", "Returned"] } } },
            {
                $group: {
                    _id: "$items.product_id",
                    totalQuantitySold: { $sum: 1 }
                }
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 4 },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" }
        ]);


        const bestSellingCategories = await Order.aggregate([
            { $unwind: "$items" },
            { $match: { "items.status": { $nin: ["Cancelled", "Returned"] } } },
            {
                $group: {
                    _id: "$items.category",
                    totalQuantitySold: { $sum: 1 }
                }
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 3 },
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },
            { $unwind: "$categoryDetails" }
        ]);


        console.log("xValues:", xValues, "yValues:", yValues);

        res.render("dashboard", {
            revenue,
            salesCount: totalSalesCount,
            usersCount: totalUsersCount,
            xValues: JSON.stringify(xValues),
            yValues: JSON.stringify(yValues),
            products: bestSellingProducts,
            categories: bestSellingCategories,
            timePeriods,
            currentPeriod,
        });

    } catch (error) {
        console.log("error in loadDashboard", error);
        error.statusCode = 500;
        next(error);
    }
};

const verfyLogin = async (req, res, next) => {
    try {
        const email = req.body.email;
        const password = req.body.password;
        const adminData = await Admin.findOne({ email: email });

        if (adminData) {
            if (password == adminData.password) {
                req.session.admin_id = adminData._id;
                res.redirect("/admin/dashboard");
            } else {
                res.render('login', { message: "Email or Password is incorrect." })
            }

        } else {
            res.render('login', { message: "Email or Password is incorrect." })
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || 1, 10);
        const query = (req.query.q || "").trim();
        const limit = 10;
        const skip = (page - 1) * limit;

        const filter = query
            ? {
                $or: [
                    { name: { $regex: query, $options: "i" } },
                    { email: { $regex: query, $options: "i" } },
                ],
            }
            : {};

        const [users, totalUsers] = await Promise.all([
            User.find(filter).skip(skip).limit(limit),
            User.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalUsers / limit) || 1;

        const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));
        if (wantsJson) {
            return res.json({ users, totalPages, currentPage: page, query });
        }

        res.render("users", { users, totalPages, currentPage: page, query });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};

const blockUser = async (req, res, next) => {
    try {
        const id = req.query.id;
        console.log(id)
        await User.updateOne(
            { _id: id },
            { $set: { is_block: 1 } }
        );
        const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));
        if (wantsJson) {
            return res.json({ ok: true, userId: id, is_block: 1 });
        }
        res.redirect("/admin/user-management");
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const unBlockUser = async (req, res, next) => {
    try {
        const id = req.query.id;
        console.log(id)

        await User.updateOne(
            { _id: id },
            { $set: { is_block: 0 } }
        );
        const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));
        if (wantsJson) {
            return res.json({ ok: true, userId: id, is_block: 0 });
        }
        res.redirect("/admin/user-management");
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const logout = async (req, res, next) => {
    try {
        delete req.session.admin_id;
        res.redirect("/admin");
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


export {
    securePassword,
    loadLogin,
    loadDashboard,
    verfyLogin,
    loadUsers,
    blockUser,
    unBlockUser,
    logout
}