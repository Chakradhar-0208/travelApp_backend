import multer from "multer";

const storage = multer.memoryStorage(); 
const upload = multer({ storage });

export default upload;


// using memoryStorage to get buffer and with help of cloudinary's upload_stream and streamifier moving it into cloud.