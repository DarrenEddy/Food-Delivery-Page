const express = require("express");
const app = express();
app.use(express.static("assets"));
const session = require("express-session")
const multer = require("multer")

const HTTP_PORT = process.env.PORT || 8080;
const path = require("path");

app.use(session({
    secret: 'terrace cat', // any random string used for configuring the session
    resave: false,
    saveUninitialized: true
}))

const myStorage = multer.diskStorage({
    destination: "./public/photo",
    filename: function (req, file, cb) {
        cb(null, `${Date.now()} ${path.extname(file.originalname)}`)
    }
})

app.use(express.static("./public/"))

// associate the storage config to multer middleware
const upload = multer({ storage: myStorage })

app.use(express.urlencoded({ extended: true }))

const exphbs = require("express-handlebars");
app.engine(".hbs", exphbs.engine({ extname: ".hbs" }));
app.set("view engine", ".hbs");

const mongoose = require('mongoose');

const CONNECTION_STRING = "mongodb+srv://dbUser:cZ5hJunyCieMYmuw@cluster0.ia9guyi.mongodb.net/MADS4012Project?retryWrites=true&w=majority&appName=AtlasApp";

mongoose.connect(CONNECTION_STRING)

const db = mongoose.connection
db.on("error", console.error.bind(console, "Error connecting to database: "));
db.once("open", () => {
    console.log("Mongo DB connected successfully.");
});

const Schema = mongoose.Schema

const MenuSchema = new Schema({
    name: String, description: String,
    price: Number, image: String
})
const menuCollection = mongoose.model("menu-item", MenuSchema)

const OrderSchema = new Schema({
    customerName: String, address: String,
    items: [String], dateAndTime: String, status: String,
    driverName: String, license: String
})
const orderCollection = mongoose.model("orders_collection", OrderSchema)

const DriverSchema = new Schema({
    username: String, password: String,
    fullName: String, vModel: String, vColour: String, license: String
})
const driverCollection = mongoose.model("drivers_collection", DriverSchema)

const currentOrder = []

// ===================== /menu =============================
app.get("/", async (req, res) => {
    try {
        const results = await menuCollection.find().lean().exec();

        for (item of results) {
            if (currentOrder.indexOf(item.name) >= 0) {
                item.contained = true
            }
            else {
                item.contained = false
            }
        }

        res.render("menu", { layout: false, menu: results })
    } catch (err) {
        console.log(err);
        return res.send(err)
    }
})

//===================== Your Order ================================
app.get("/yourOrder", async (req, res) => {

    try {
        const orderMenuItems = []
        for (nameOfItem of currentOrder) {
            const results = await menuCollection.findOne({ name: nameOfItem }).lean().exec()
            orderMenuItems.push(results)
        }
        return res.render("yourOrder", { layout: false, order: orderMenuItems })
    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }
})

app.get("/addToCart/:menuItemName", (req, res) => {
    const item = req.params.menuItemName
    //for checking if its already in the list ==REMOVE IF IMPLEMENTING QUANTITIY
    if (currentOrder.indexOf(item) < 0) {
        currentOrder.push(item)
    }
    //console.log(currentOrder)
    res.redirect("/")
})

app.get("/removeFromCart/:menuItemName/:redir", (req, res) => {
    const item = req.params.menuItemName

    currentOrder.splice(currentOrder.indexOf(item), 1)

    //redir handles where to redirect as this get method is used by both menu and Your Orders
    const redir = (req.params.redir == "menu") ? "" : req.params.redir
    res.redirect("/" + redir)
})


app.get("/emptyCart", (req, res) => {
    currentOrder.splice(0, currentOrder.length)
    res.redirect("/yourOrder")
})

// =================== Order Status =================================
app.get("/orderStatus", async (req, res) => {
    res.render("orderStatus", { layout: false })
})

// =================== Order History ================================
app.get("/orderHistory", (req, res) => {
    res.render("orderHistory", { layout: false })
})

// =================== Login Page ================================

app.get("/login", (req, res) => {
    res.render("login", { layout: false });
});

app.post("/login", async (req, res) => {
    const userNameFromUI = req.body.username;
    const passwordFromUI = req.body.password;

    if (userNameFromUI === undefined ||
        passwordFromUI === undefined ||
        userNameFromUI === "" ||
        passwordFromUI === "") {
        console.log(`Missing Credentials`)
        // show error is isername or password is not provided or retrieved from form
        return res.render("login", { errorMsg: "Missing Credentials", layout: false })
    }
    try {
        const driver = await driverCollection.findOne({ username: userNameFromUI }).lean().exec()

        if (driver === null) {
            return res.render("login", { errorMsg: "User not found ", layout: false })
        }
        if (userNameFromUI === driver.username &&
            passwordFromUI === driver.password) {
            console.log(`Login successful for ${driver.username}`)
            // before redirecting user to dashboard, save any necessary information in session
            req.session.driver = {
                uname: driver.username,
                fullName: driver.fullName,
                vModel: driver.vModel,
                vColour: driver.vColour,
                license: driver.license
            }
            req.session.isLoggedIn = true
            // redirect the user toor dashboard upon successful login
            return res.redirect("/dashboard")
        } else {
            console.log("Invalid credentials. Please try again!")
            return res.render("login", {
                errorMsg: "Invalid credentials. Please try again!",
                layout: false
            })
        }
    } catch (err) {
        console.log(err)
    }
})

// =================== Function of ensuring user login first ================
const ensureLogin = (req, res, next) => {
    if (req.session.isLoggedIn !== undefined &&
        req.session.isLoggedIn &&
        req.session.driver !== undefined) {
        //if user has logged in allow them to go to desired endpoint
        next()
    } else {
        //otherwise,ask them to login first
        return res.render("login",
            {
                errorMsg: "You must login first to access dashboard",
                layout: false
            })
    }
}

// ============= Dashboard =================
app.get("/dashboard", ensureLogin, (req, res) => {
    res.render("dashboard", { layout: false })
})

// ====================== List of order ready for transit ======================
app.get("/openDeliveries", ensureLogin, async (req, res) => {
    try {
        const openOrder = await orderCollection.find({ status: "READY FOR DELIVERY" }).lean().exec();
        if (openOrder.length === 0) {
            res.render("openDeliveries", { errorMsg: `No order currently`, layout: false })
        } else {
            res.render("openDeliveries", { layout: false, openOrder: openOrder })
        }
    } catch (err) {
        console.log(err)
    }
})

app.post("/takeOrder/:customerName", ensureLogin, async (req, res) => {
    const customerName = req.params.customerName
    try {
        const customerOrder = await orderCollection.findOne({ customerName: customerName })
        const driver = req.session.driver
        const updateStatus = {
            status: "IN TRANSIT",
            driverName: driver.fullName,
            license: driver.license
        }
        await customerOrder.updateOne(updateStatus)
        res.redirect("/openDeliveries")
    } catch (err) {
        console.log(err)
    }
})

// ===================== Fulfillment Page =======================
app.get("/fulfillment", ensureLogin, async (req, res) => {
    try {
        const transitOrder = await orderCollection.find({ status: "IN TRANSIT" }).lean().exec();
        if (transitOrder.length === 0) {
            res.render("fulfillment", { errorMsg: `No order extracted`, layout: false })
        } else {
            res.render("fulfillment", { layout: false, transitOrder: transitOrder })
        }
    } catch (err) {
        console.log(err)
    }
})

app.post("/orderArrived/:customerName", ensureLogin, async (req, res) => {
    const customerName = req.params.customerName
    try {
        const customerOrder = await orderCollection.findOne({ customerName: customerName })
        const updateStatus = {
            status: "Delivered"
        }
        await customerOrder.updateOne(updateStatus)
        res.redirect("/fulfillment")
    } catch (err) {
        console.log(err)
    }
})

// ======================= Photo upload =======================
app.post("/photoUpload", ensureLogin, upload.single("photo"), async (req, res) => {
    const formFile = req.file
    if (req.file === undefined) {
        res.render("fulfillment", { errorMsg: `photo not provided with form data`, layout: false })
    }

    if (req.body !== undefined) {
        const photo = { src: `/photo/${formFile.filename}` }
        res.render("fulfillment", { layout: false, uploadedPhoto: "Photo of order delivery uploaded" })
    } else {
        res.render("fulfillment", { errorMsg: `Unable to receive data from form`, layout: false })
    }
})

// ======================= Logout ===========================
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login")
})

// ----------------
const onHttpStart = () => {
    console.log(`Express web server running on port: ${HTTP_PORT}`)
    console.log(`Press CTRL+C to exit`)
}
app.listen(HTTP_PORT, onHttpStart)
