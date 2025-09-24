import Order from "../models/orderModel.js";

const loadSales = async (req, res,next) => {
    try {
        let { reportType, startDate, endDate } = req.query;
        console.log("req.query :")

        const reportTypes = ["All", "Today", "Last Week", "Last Month", "This Year", "Custom Date Range"];
        let currentType = reportType;

        if (!reportType || reportType === 'Today') {
            const today = new Date();
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            currentType = "Today";

        } else if (reportType === 'Last Week') {
            const today = new Date();
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
            endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

        } else if (reportType === 'Last Month') {
            const today = new Date();
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);


        } else if (reportType === 'This Year') {
            const today = new Date();
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear() + 1, 0, 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

        } else if (reportType === 'Custom Date Range') {
            // Parse start date and end date from request query
            startDate = new Date(startDate);
            endDate = new Date(endDate);
            // Adjust start date to include the entire selected day
            startDate.setHours(0, 0, 0, 0);
            // Adjust end date to include the entire selected day
            endDate.setHours(23, 59, 59, 999);
        }

        let salesData;

        if (reportType === 'All') {

            salesData = await Order.aggregate([
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
                { $sort: { date: -1 } }
            ]);

        } else {

            salesData = await Order.aggregate([
                {
                    $match: {
                        date: { $gte: startDate, $lte: endDate }
                    }
                },
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
                { $sort: { date: -1 } }
            ]);
        }

        res.render("sales", { sales: salesData, currentType, reportTypes, reportType, startDate, endDate });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

export {
    loadSales,
}



