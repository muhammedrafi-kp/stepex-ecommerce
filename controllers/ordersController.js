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
        console.log(orderId);
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });

        const orderData = await Order.findOne({ user: req.session._id, orderId: orderId }).populate("user");
        if (!orderData) {
            return res.redirect('/orders');
        }

        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cartData ? cartData.items.length : 0;
        // console.log(orderData)
        res.render("order-details", { user: userData, order: orderData, cartCount: cartItemCount });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const cancelOrder = async (req, res, next) => {
    try {

        console.log("cancel order")
        const { cancellationReason, productId, orderId } = req.body;

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId, "items.product_id": productId },
            {
                $set: {
                    'items.$.status': "Cancelled",
                    'items.$.reason': cancellationReason
                }
            },
            { new: true }
        );

        const cancelledProduct = updatedOrder.items.find(item => item.product_id.toString() === productId);
        const cancelledQuantity = parseInt(cancelledProduct.quantity);

        await Product.findOneAndUpdate(
            { _id: productId },
            { $inc: { quantity: cancelledQuantity } }
        );

        if (updatedOrder.payment_method === "Razorpay" || updatedOrder.payment_method === "Wallet") {

            const wallet = await Wallet.findOne({ user_id: req.session._id });

            const refundAmount = cancelledProduct.price * cancelledQuantity;
            console.log("refundAmount:", refundAmount);
            const previousBalance = wallet.balance;


            await Wallet.findOneAndUpdate(
                { user_id: req.session._id },
                {
                    $inc: { balance: refundAmount },
                    $push: {
                        history: {
                            amount: refundAmount,
                            transaction_type: "Refund",
                            date: new Date(),
                            previous_balance: previousBalance
                        }
                    }
                },
                { upsert: true }
            );
        }

        console.log(updatedOrder);
        res.status(200).json({ message: 'Order cancelled successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const returnOrder = async (req, res, next) => {
    try {
        console.log("return order")
        const { productId, orderId, returnReason } = req.body;
        req.session.reason = returnReason;
        console.log(productId, orderId, returnReason);

        const updatedOrder = await Order.findOneAndUpdate(
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
        const limit = 10;
        const skip = (page - 1) * limit;
        const totalCount = await Order.countDocuments();
        const totalPages = Math.ceil(totalCount / limit);
        const ordersData = await Order.find().populate("user").skip(skip).limit(limit).sort({ date: -1 });

        res.render("orders", { orders: ordersData, currentPage: page, totalPages: totalPages });

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

        const orderStatus = ["Confirmed", "Shipped", "Cancelled", "Delivered"]
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


const approveReturn = async (req, res, next) => {
    try {
        console.log("return order")
        const { productId, orderId, reason } = req.body;

        console.log(productId, orderId, reason);

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId, "items.product_id": productId },
            {
                $set: {
                    'items.$.return_approval': 2,
                    'items.$.status': "Returned",
                    'items.$.reason': reason
                }
            },
            { new: true }
        );

        const returnedProduct = updatedOrder.items.find(item => item.product_id.toString() === productId);
        const returnedQuantity = parseInt(returnedProduct.quantity);

        if (returnedProduct.reason !== "Defective or Damaged Product") {

            await Product.findOneAndUpdate(
                { _id: productId },
                { $inc: { quantity: returnedQuantity } }
            );
        }

        const wallet = await Wallet.findOne({ user_id: req.session._id });

        const refundAmount = returnedProduct.price * returnedQuantity;
        const previousBalance = wallet.balance;

        await Wallet.findOneAndUpdate(
            { user_id: req.session._id },
            {
                $inc: { balance: refundAmount },
                $push: {
                    history: {
                        amount: refundAmount,
                        transaction_type: "Refund",
                        date: new Date(),
                        previous_balance: previousBalance
                    }
                }
            },
            { upsert: true }
        );

        res.status(200).json({ message: 'Order returned successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
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

const orderRepaymentRazorPpay = async (req, res, next) => {
    try {
        console.log(razorpay.key_id, razorpay.key_secret);

        const { orderId } = req.body;
        const orderData = await Order.findOne({ orderId: orderId });
        console.log(orderData.totalAmount);
        const amount = orderData.totalAmount;
        const receiptID = generatereceiptID();
        const order = await razorpay.orders.create({
            amount: amount * 100,
            currency: 'INR',
            receipt: `${receiptID}`,
            payment_capture: 1
        });

        res.status(200).json({ success: true, order });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const orderRepayment = async (req, res, next) => {
    try {

        const { orderId } = req.body;
        console.log(orderId);

        await Order.findOneAndUpdate(
            { orderId: orderId },
            { payment_status: "Success" },
            { new: true }
        );

        // Update each product status to "Confirmed"
        const order = await Order.findOne({ orderId: orderId });
        const bulkWriteOperations = order.items.map((item) => ({
            updateOne: {
                filter: { _id: item.product_id },
                update: { $set: { "items.$.status": "Confirmed" } }
            }
        }));

        // Execute bulk write operations
        await Order.bulkWrite(bulkWriteOperations);

        console.log(order)

        res.status(200).json({ success: true, message: 'Order payment status updated successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
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