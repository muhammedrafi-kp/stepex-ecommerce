import mongoose from "mongoose";
import User from "../models/userModel.js";
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


const loadWallet = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cart ? cart.items.length : 0;
        const walletData = await Wallet.findOne({ user_id: userId });
        res.render("wallet", { user: userData, cartCount: cartItemCount, wallet: walletData });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadAddMoney = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cart ? cart.items.length : 0;
        const walletData = await Wallet.findOne({ user_id: userId });
        res.render("wallet-add-money", { user: userData, cartCount: cartItemCount, wallet: walletData, razorpaykey: RAZORPAY_ID_KEY });
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

const createRazorPayforAddMoney = async (req, res, next) => {
    try {
        console.log(razorpay.key_id, razorpay.key_secret);
        const { amount } = req.body;
        console.log(amount)
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
};

const addMoney = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { amount } = req.body;
        const userId = req.session._id;

        let wallet = await Wallet.findOne({ user_id: userId }).session(session);

        if (!wallet) {
            wallet = new Wallet({
                user_id: userId,
                balance: 0,
                history: []
            });
        }

        const previousBalance = wallet.balance;
        const updatedBalance = previousBalance + amount;
        wallet.balance = updatedBalance;

        const transaction = {
            amount: parseFloat(amount),
            transaction_type: 'credit',
            previous_balance: previousBalance,
            new_balance: updatedBalance,
            created_at: new Date()
        };

        wallet.history.push(transaction);

        await wallet.save({ session });

        await session.commitTransaction();

        res.status(200).json({ success: true });

    } catch (error) {
        await session.abortTransaction();
        error.statusCode = 500;
        next(error);
    } finally {
        session.endSession();
    }
}

const loadWithdrawMoney = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cart ? cart.items.length : 0;
        const walletData = await Wallet.findOne({ user_id: userId });
        res.render("wallet-withdraw-money", { user: userData, cartCount: cartItemCount, wallet: walletData });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const WithdrawMoney = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const userId = req.session._id;

        const { amount } = req.body;

        if (!amount || amount <= 0) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid amount' });
        }

        let wallet = await Wallet.findOne({ user_id: userId }).session(session);

        if (!wallet) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Wallet not found' });
        }

        if (wallet.balance < amount) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        const previousBalance = wallet.balance;
        const updatedBalance = previousBalance - amount;
        wallet.balance = updatedBalance;

        const transaction = {
            amount: parseFloat(amount),
            transaction_type: 'debit',
            previous_balance: previousBalance,
            new_balance: updatedBalance,
            created_at: new Date()
        };


        wallet.history.push(transaction);

        await wallet.save({ session });

        await session.commitTransaction();
        
        return res.status(200).json({ message: 'Withdrawal successful.' });
    } catch (error) {
        await session.abortTransaction();
        error.statusCode = 500;
        next(error);
    } finally {
        session.endSession();
    }
};

const loadWalletHistory = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cart ? cart.items.length : 0;
        const walletData = await Wallet.findOne({ user_id: userId });

        res.render("wallet-history", { user: userData, cartCount: cartItemCount, wallet: walletData });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


export {
    loadWallet,
    loadAddMoney,
    createRazorPayforAddMoney,
    addMoney,
    loadWithdrawMoney,
    WithdrawMoney,
    loadWalletHistory
}