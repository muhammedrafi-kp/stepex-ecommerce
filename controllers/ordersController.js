import mongoose from "mongoose";
import User from "../models/userModel.js";
import Order from "../models/orderModel.js";
import Product from "../models/productsModel.js";
import Cart from "../models/cartModel.js";
import Wallet from "../models/walletModel.js";
import Razorpay from "razorpay";
import dotenv from 'dotenv';

dotenv.config();

const { RAZORPAY_ID_KEY, RAZORPAY_SECRET_KEY } = process.env;

const razorpay = new Razorpay({
    key_id: RAZORPAY_ID_KEY,
    key_secret: RAZORPAY_SECRET_KEY
});


const laodOrders = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const totalCount = await Order.countDocuments({ user: userId });
        const totalPages = Math.ceil(totalCount / limit);

        const ordersData = await Order.find({ user: userId }).sort({ date: -1 }).skip(skip).limit(limit);

        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cartData ? cartData.items.length : 0;

        res.render("orders", { user: userData, orders: ordersData, cartCount: cartItemCount, currentPage: page, totalPages: totalPages, razorpaykey: RAZORPAY_ID_KEY })

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadOrderDetails = async (req, res, next) => {
    try {
        const orderId = req.query.id;
        const userId = req.session._id;

        const userData = await User.findById(userId);

        const orderData = await Order.findOne({ user: userId, orderId }).populate("user");

        if (!orderData) {
            return res.redirect("/orders");
            // return res.status(403).json({ success: false, message: "Access denied" });
        }

        const cartData = await Cart.findOne({ user_id: userId }).populate("items.products");
        const cartItemCount = cartData ? cartData.items.length : 0;

        res.render("order-details", { user: userData, order: orderData, cartCount: cartItemCount });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

// const cancelOrder = async (req, res, next) => {
//     try {

//         console.log("cancel order")
//         const { cancellationReason, productId, orderId } = req.body;

//         const updatedOrder = await Order.findOneAndUpdate(
//             { orderId: orderId, "items.product_id": productId },
//             {
//                 $set: {
//                     'items.$.status': "Cancelled",
//                     'items.$.reason': cancellationReason
//                 }
//             },
//             { new: true }
//         );

//         const cancelledProduct = updatedOrder.items.find(item => item.product_id.toString() === productId);
//         const cancelledQuantity = parseInt(cancelledProduct.quantity);

//         await Product.findOneAndUpdate(
//             { _id: productId },
//             { $inc: { quantity: cancelledQuantity } }
//         );

//         if (updatedOrder.payment_method === "Razorpay" || updatedOrder.payment_method === "Wallet") {

//             const wallet = await Wallet.findOne({ user_id: req.session._id });

//             const refundAmount = cancelledProduct.price * cancelledQuantity;
//             console.log("refundAmount:", refundAmount);
//             const previousBalance = wallet.balance;


//             await Wallet.findOneAndUpdate(
//                 { user_id: req.session._id },
//                 {
//                     $inc: { balance: refundAmount },
//                     $push: {
//                         history: {
//                             amount: refundAmount,
//                             transaction_type: "Refund",
//                             date: new Date(),
//                             previous_balance: previousBalance
//                         }
//                     }
//                 },
//                 { upsert: true }
//             );
//         }

//         console.log(updatedOrder);
//         res.status(200).json({ message: 'Order cancelled successfully' });

//     } catch (error) {
//         error.statusCode = 500;
//         next(error);
//     }
// }

const cancelOrder = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { cancellationReason, productId, orderId } = req.body;

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId, "items.product_id": productId },
            {
                $set: {
                    "items.$.status": "Cancelled",
                    "items.$.reason": cancellationReason
                }
            },
            { new: true, session }
        );

        const cancelledProduct = updatedOrder.items.find(item => item.product_id.toString() === productId);
        const cancelledQuantity = parseInt(cancelledProduct.quantity);

        await Product.findOneAndUpdate(
            { _id: productId },
            { $inc: { quantity: cancelledQuantity } },
            { session }
        );

        if (updatedOrder.payment_method === "Razorpay" || updatedOrder.payment_method === "Wallet") {

            const wallet = await Wallet.findOne({ user_id: req.session._id }).session(session);
            const refundAmount = cancelledProduct.price * cancelledQuantity;
            const previousBalance = wallet.balance;

            wallet.balance += refundAmount;
            wallet.history.push({
                amount: refundAmount,
                transaction_type: "Refund",
                previous_balance: previousBalance,
                new_balance: wallet.balance,
                date: new Date()
            });

            await wallet.save({ session });
        }

        await session.commitTransaction();

        res.status(200).json({ message: "Order cancelled successfully" });
    } catch (error) {
        await session.abortTransaction();
        error.statusCode = 500;
        next(error);
    } finally {
        session.endSession();
    }
}

const returnOrder = async (req, res, next) => {
    try {
        console.log("return order")
        const { productId, orderId, returnReason } = req.body;
        req.session.reason = returnReason;
        console.log(productId, orderId, returnReason);

        await Order.findOneAndUpdate(
            { user: req.session._id, orderId: orderId, "items.product_id": productId },
            { $set: { 'items.$.return_approval': 1, 'items.$.reason': returnReason } },
            { new: true }
        );

        res.status(200).json({ message: 'Order returned successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadAdminOrders = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const query = (req.query.q || '').trim();
        const status = (req.query.status || '').trim();
        const sortBy = (req.query.sortBy || 'date');
        const sortOrder = (req.query.sortOrder || 'desc'); // 'asc' | 'desc'
        const limit = 10;
        const skip = (page - 1) * limit;

        let matchClause = {};
        if (query) {
            // Find users whose name or email matches
            const matchingUsers = await User.find({
                $or: [
                    { name: { $regex: query, $options: 'i' } },
                    { email: { $regex: query, $options: 'i' } },
                ]
            }, { _id: 1 });
            const userIds = matchingUsers.map(u => u._id);

            matchClause = {
                $or: [
                    { orderId: { $regex: query, $options: 'i' } },
                    { user: { $in: userIds } },
                ]
            };
        }

        if (status) {
            matchClause.payment_status = status;
        }

        // Build sort option (only on indexable/simple fields)
        const sort = {};
        const normalizedOrder = (String(sortOrder).toLowerCase() === 'asc') ? 1 : -1;
        if (sortBy === 'totalAmount') sort.totalAmount = normalizedOrder;
        else if (sortBy === 'orderId') sort.orderId = normalizedOrder;
        else sort.date = normalizedOrder; // default

        const [totalCount, ordersData] = await Promise.all([
            Order.countDocuments(matchClause),
            Order.find(matchClause).populate('user').sort(sort).skip(skip).limit(limit),
        ]);

        const totalPages = Math.ceil(totalCount / limit) || 1;

        const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
        if (wantsJson) {
            return res.json({ orders: ordersData, currentPage: page, totalPages, query, status, sortBy, sortOrder });
        }

        res.render("orders", { orders: ordersData, currentPage: page, totalPages: totalPages, query, status, sortBy, sortOrder });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadAdminOrderDetails = async (req, res, next) => {
    try {
        const orderId = req.query.id;
        console.log("order id:", orderId);
        const orderData = await Order.findOne({ orderId: orderId }).populate("user");
        const orderStatus = ["Confirmed", "Shipped", "Cancelled", "Delivered"];
        res.render("order-details", { order: orderData, status: orderStatus });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const changeOrderStatus = async (req, res, next) => {
    try {
        console.log("hello");
        const { orderId, productId, status } = req.body;

        console.log(orderId, productId, status);
        const updatedOrder = await Order.findOneAndUpdate(
            {
                orderId: orderId,
                'items.product_id': productId
            },
            { $set: { 'items.$.status': status } },
            { new: true }
        );

        if (status == "Cancelled") {
            const cancelledProduct = updatedOrder.items.find(item => item.product_id.toString() === productId);
            const cancelledQuantity = parseInt(cancelledProduct.quantity);

            await Product.findOneAndUpdate(
                { _id: productId },
                { $inc: { quantity: cancelledQuantity } }
            );
        }

        res.status(200).json({});

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

// const approveReturn = async (req, res, next) => {
//     try {
//         console.log("return order")
//         const { productId, orderId, reason } = req.body;

//         console.log(productId, orderId, reason);

//         const updatedOrder = await Order.findOneAndUpdate(
//             { orderId: orderId, "items.product_id": productId },
//             {
//                 $set: {
//                     'items.$.return_approval': 2,
//                     'items.$.status': "Returned",
//                     'items.$.reason': reason
//                 }
//             },
//             { new: true }
//         );

//         const returnedProduct = updatedOrder.items.find(item => item.product_id.toString() === productId);
//         const returnedQuantity = parseInt(returnedProduct.quantity);

//         if (returnedProduct.reason !== "Defective or Damaged Product") {

//             await Product.findOneAndUpdate(
//                 { _id: productId },
//                 { $inc: { quantity: returnedQuantity } }
//             );
//         }

//         const wallet = await Wallet.findOne({ user_id: req.session._id });

//         const refundAmount = returnedProduct.price * returnedQuantity;
//         const previousBalance = wallet.balance;

//         await Wallet.findOneAndUpdate(
//             { user_id: req.session._id },
//             {
//                 $inc: { balance: refundAmount },
//                 $push: {
//                     history: {
//                         amount: refundAmount,
//                         transaction_type: "Refund",
//                         date: new Date(),
//                         previous_balance: previousBalance
//                     }
//                 }
//             },
//             { upsert: true }
//         );

//         res.status(200).json({ message: 'Order returned successfully' });

//     } catch (error) {
//         error.statusCode = 500;
//         next(error);
//     }
// }

const approveReturn = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { productId, orderId, reason } = req.body;
        console.log("return order :", productId, orderId, reason);

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId, "items.product_id": productId },
            {
                $set: {
                    "items.$.return_approval": 2,
                    "items.$.status": "Returned",
                    "items.$.reason": reason
                }
            },
            { new: true, session }
        );

        const returnedProduct = updatedOrder.items.find(item => item.product_id.toString() === productId);
        const returnedQuantity = parseInt(returnedProduct.quantity);

        // Restore stock
        if (returnedProduct.reason !== "Defective or Damaged Product") {
            await Product.findOneAndUpdate(
                { _id: productId },
                { $inc: { quantity: returnedQuantity } },
                { session }
            );
        }

        // Update wallet
        const wallet = await Wallet.findOne({ user_id: req.session._id }).session(session);
        const refundAmount = returnedProduct.price * returnedQuantity;
        const previousBalance = wallet.balance;

        wallet.balance += refundAmount;
        wallet.history.push({
            amount: refundAmount,
            transaction_type: "Refund",
            previous_balance: previousBalance,
            new_balance: wallet.balance,
            date: new Date()
        });

        await wallet.save({ session });

        await session.commitTransaction();

        res.status(200).json({ message: "Order returned successfully" });

    } catch (error) {
        await session.abortTransaction();
        error.statusCode = 500;
        next(error);
    } finally {
        session.endSession();
    }
}

const declineReturn = async (req, res, next) => {
    try {
        console.log("return order")
        const { productId, orderId } = req.body;

        console.log(productId, orderId);

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId, "items.product_id": productId },
            { $set: { 'items.$.return_approval': 3 } },
            { new: true }
        );

        console.log(updatedOrder);

        res.status(200).json({ message: 'Order returned successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const generatereceiptID = () => {
    const min = 10000000;
    const max = 99999999;
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// const orderRepaymentRazorPpay = async (req, res, next) => {
//     try {
//         console.log(razorpay.key_id, razorpay.key_secret);

//         const { orderId } = req.body;
//         const orderData = await Order.findOne({ orderId: orderId });
//         console.log(orderData.totalAmount);
//         const amount = orderData.totalAmount;
//         const receiptID = generatereceiptID();
//         const order = await razorpay.orders.create({
//             amount: amount * 100,
//             currency: 'INR',
//             receipt: `${receiptID}`,
//             payment_capture: 1
//         });

//         res.status(200).json({ success: true, order });
//     } catch (error) {
//         error.statusCode = 500;
//         next(error);
//     }
// }

const orderRepaymentRazorPpay = async (req, res, next) => {
    try {

        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }
        // console.log(razorpay.key_id, razorpay.key_secret);

        const orderData = await Order.findOne({ orderId });
        if (!orderData) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const amount = orderData.totalAmount;
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: "Invalid order amount" });
        }

        const receiptID = generatereceiptID();

        const razorpayOrder = await razorpay.orders.create({
            amount: amount * 100, 
            currency: 'INR',
            receipt: receiptID,
            payment_capture: 1
        });

        res.status(200).json({ success: true, order: razorpayOrder });

    } catch (error) {
        console.error("Error in orderRepaymentRazorPay:", error);
        error.statusCode = 500;
        next(error);
    }
}

// const orderRepayment = async (req, res, next) => {
//     try {
//         const { orderId } = req.body;
//         console.log(orderId);

//         await Order.findOneAndUpdate(
//             { orderId: orderId },
//             { payment_status: "Success" },
//             { new: true }
//         );

//         // Update each product status to "Confirmed"
//         const order = await Order.findOne({ orderId: orderId });
//         const bulkWriteOperations = order.items.map((item) => ({
//             updateOne: {
//                 filter: { _id: item.product_id },
//                 update: { $set: { "items.$.status": "Confirmed" } }
//             }
//         }));

//         // Execute bulk write operations
//         await Order.bulkWrite(bulkWriteOperations);

//         console.log(order)

//         res.status(200).json({ success: true, message: 'Order payment status updated successfully' });

//     } catch (error) {
//         error.statusCode = 500;
//         next(error);
//     }
// }

const orderRepayment = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId } = req.body;
        console.log(orderId);

        const order = await Order.findOneAndUpdate(
            { orderId },
            { payment_status: "Success" },
            { new: true, session }
        );

        // Update each item status
        const bulkOps = order.items.map((item, index) => ({
            updateOne: {
                filter: { orderId, [`items.${index}.product_id`]: item.product_id },
                update: { $set: { [`items.${index}.status`]: "Confirmed" } }
            }
        }));

        await Order.bulkWrite(bulkOps, { session });

        await session.commitTransaction();

        console.log("order :", order);

        res.status(200).json({ success: true, message: 'Order payment status updated successfully' });

    } catch (error) {
        await session.abortTransaction();
        error.statusCode = 500;
        next(error);
    } finally {
        session.endSession()
    }
}


export {
    laodOrders,
    loadOrderDetails,
    orderRepaymentRazorPpay,
    orderRepayment,
    loadAdminOrders,
    loadAdminOrderDetails,
    changeOrderStatus,
    cancelOrder,
    returnOrder,
    approveReturn,
    declineReturn
}