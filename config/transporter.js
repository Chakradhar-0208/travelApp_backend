import "dotenv/config";
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
});
if (process.env.NODE_ENV !== "test")
  transporter.verify((error, success) => {
    if (error) {
      console.error("SMTP Error:", error);
    } else {
      console.log("Brevo SMTP is ready to send emails ✔");
    }
  });
