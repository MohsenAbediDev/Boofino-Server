const express = require('express')
const session = require('express-session')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const bodyparser = require('body-parser')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const ai = require('./ai')
const upload = require('./upload')
const host = 'http://localhost:3000'
let app = express()

mongoose.connect('mongodb://localhost:27017/boofino_db')

let userSchema = new mongoose.Schema({
	fullname: String,
	username: String,
	passwordHash: String,
	phonenumber: String,
	is_admin: Boolean,
	imgUrl: String,
	wallet: Number,
	schoolId: String,
})

let schoolSchema = new mongoose.Schema({
	schoolId: String,
	name: String,
	address: String,
	city: String,
	state: String,
	imgUrl: String,
	products: [
		{
			name: String,
			imgUrl: String,
			price: Number,
			off: Number,
			group: String,
			finalPrice: Number,
			sellCount: Number,
			itemCount: Number,
			dateTime: Date,
			freeTime: Object,
			oldPrice: Number,
			isDiscount: Boolean,
		},
	],
})

const User = mongoose.model('User', userSchema)
const School = mongoose.model('School', schoolSchema)

app.use('/static', express.static('uploads/'))
app.use(function (req, res, next) {
	// Website you wish to allow to connect
	res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')

	// Request methods you wish to allow
	res.setHeader(
		'Access-Control-Allow-Methods',
		'GET, POST, OPTIONS, PUT, PATCH, DELETE'
	)

	// Request headers you wish to allow
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')

	// Set to true if you need the website to include cookies in the requests sent
	// to the API (e.g. in case you use sessions)
	res.setHeader('Access-Control-Allow-Credentials', true)

	// Pass to next layer of middleware
	next()
})

app.use(
	session({
		secret: 'this is a secret',
		resave: false,
		saveUninitialized: true,
		cookie: { secure: false },
	})
)
app.use(bodyparser.urlencoded({ extended: false }))
app.use(bodyparser.json())

app.get('/user', async (req, res) => {
	if (!req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	let getUsername = await User.find({ username: req.session.user.username })

	if (getUsername.length == 0) {
		req.session.user = null
		return res.status(404).json({ message: '404' })
	}
	return res.status(200).json(getUsername)
})

app.put('/user', async (req, res) => {
	try {
		const newUserData = req.body

		if (!req.session.user) {
			return res
				.status(401)
				.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
		}

		const currentUser = await User.findById(req.session.user._id)

		if (newUserData.fullname) {
			currentUser.fullname = newUserData.fullname
		}
		if (newUserData.username) {
			currentUser.username = newUserData.username
		}
		if (newUserData.phonenumber) {
			currentUser.phonenumber = newUserData.phonenumber
		}
		if (newUserData.wallet) {
			currentUser.wallet = newUserData.wallet
		}
		if (newUserData.schoolId) {
			currentUser.schoolId = newUserData.schoolId
		}

		await currentUser.save()

		res.status(200).send('اطلاعات کاربر با موفقیت به روز شد')
	} catch (error) {
		res.status(500).send('خطا در به روز رسانی اطلاعات کاربر')
	}
})

app.post('/register', async (req, res) => {
	if (req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما از قبل به حساب کاربری خود وارد شده اید' })
	}
	const { fullname, username, password, confirmpassword, phonenumber, imgUrl } =
		req.body
	if (!fullname || !username || !password || !confirmpassword || !phonenumber) {
		return res.status(400).json({ message: 'لطفا تمام فیلد ها را پر کنید' })
	}

	if (password !== confirmpassword) {
		return res.status(406).json({ message: 'پسور ها با یکدیگر تطابق ندارند' })
	}
	if (password.length < 8) {
		return res.status(406).json({
			message: 'تعداد کاراکتر های رمز عبور باید بیشتر از 8 کاراکتر باشد',
		})
	}
	let checkUser = await User.find({ username })
	if (checkUser.length > 0) {
		return res.status(406).json({ message: 'این نام از قبل وجود دارد' })
	}
	const passwordhash = bcrypt.hashSync(password, 10)

	let newUser = new User({
		fullname,
		username,
		passwordHash: passwordhash,
		phonenumber,
		is_admin: false,
		imgUrl,
		wallet: 0,
		schoolId: null,
	})
	await newUser.save()
	req.session.user = newUser
	return res
		.status(201)
		.json({ message: 'حساب کاربری شما با موفقیت ثبت گردید' })
})

app.post('/login', async (req, res) => {
	if (req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما از قبل به حساب کاربری خود وارد شده اید' })
	}
	const { username, password } = req.body
	if (!username || !password) {
		return res.status(400).json({ message: 'لطفا تمام فیلد ها را پر کنید' })
	}
	let userData = await User.find({ username })
	if (userData.length > 0) {
		if (bcrypt.compareSync(password, userData[0].passwordHash)) {
			req.session.user = userData[0]
			return res
				.status(202)
				.json({ message: 'شما به حساب کاربری خود وارد شدید' })
		} else {
			return res.status(406).json({ message: 'رمز عبور شما اشتباه است' })
		}
	} else {
		return res.status(406).json({ message: 'نام کاربری شما اشتباه است' })
	}
})

app.get('/logout', (req, res) => {
	req.session.user = null
	res.status(202).json({ message: 'با موفقیت از حساب کاربری خود خارج شدید' })
})

// Add new product to school
app.post('/addproduct', async (req, res) => {
	if (!req.session.user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	const {
		name,
		imgUrl,
		price,
		off,
		group,
		finalPrice,
		sellCount,
		itemCount,
		dateTime,
		freeTime,
		oldPrice,
		isDiscount,
	} = req.body

	try {
		// Find the user's school and update the products array
		const user = req.session.user

		if (!user.is_admin) {
			return res
				.json(
					{ message: 'شما دسترسی لازم برای اضافه کردن محصول را ندارید' },
					409
				)
				.end()
		}

		if (user.schoolId) {
			const schoolId = user.schoolId
			const school = await School.findOne({ schoolId: schoolId })

			const exitingProduct = school.products.find(
				(product) => product.name === name
			)

			if (exitingProduct) {
				return res
					.json({ message: 'محصولی با این نام از قبل وجود دارد' }, 409)
					.end()
			}

			if (school) {
				// Create a new product object
				const newProduct = {
					name,
					imgUrl,
					price,
					off,
					group,
					finalPrice,
					sellCount,
					itemCount,
					dateTime,
					freeTime,
					oldPrice,
					isDiscount,
				}

				// Add the product to the school's products array
				school.products.push(newProduct)
				await school.save()

				return res.status(201).json({
					message: 'محصول با موفقیت اضافه شد',
				})
			} else {
				return res.status(404).json({ message: 'مدرسه مربوطه یافت نشد' })
			}
		} else {
			return res.status(400).json({ message: 'کاربر به مدرسه‌ای متصل نیست' })
		}
	} catch (error) {
		return res
			.status(500)
			.json({ message: 'خطا در افزودن محصول', error: error.message })
	}
})

// Get school products
app.get('/products', async (req, res) => {
	const user = req.session.user

	const schoolId = user && user.schoolId
	const school = await School.findOne({ schoolId: schoolId })
	const products = school && school.products

	if (!user) {
		return res
			.status(406)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	if (products) {
		return res.status(200).json(products)
	}
})

app.get('/schools', async (req, res) => {
	try {
		const schools = await School.find()
		if (schools.length <= 0) {
			return res.status(404).json({ error: 'مدرسه ای یافت نشد' })
		}
		return res.json(schools)
	} catch (error) {
		return res.status(500).json({ error: 'خطا در اتصال' })
	}
})

app.post('/select-school', async (req, res) => {
	const { schoolId } = req.body
	try {
		const selectedSchool = await School.findById(schoolId)
		if (!selectedSchool) {
			return res.status(404).json({ error: 'مدرسه یافت نشد' })
		}
		return res.json(selectedSchool)
	} catch (error) {
		return res.status(500).json({ error: 'خطا در اتصال' })
	}
})

app.post('/uploadimg', upload.single('imgUrl'), async (req, res) => {
	try {
		return res.json({ message: host + '/static/' + req.file.filename }, 201).end
	} catch {
		return res.json({ message: 'لطفا در درج اطلاعات دقت حاصل نمایید' }, 400).end
	}
})

// Security
app.use(helmet())
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
})
app.use(limiter)

app.listen(3000)
