import { transporter } from "./config/transporter.js";

async function sendTestEmail() {
  try {
    await transporter.sendMail({
      from: `"TravelMate Support" <${process.env.BREVO_USER}>`,
      to: "yourpersonalemail@example.com", // replace with your email
      subject: "Test Email from Brevo SMTP",
      text: "This is a test email from Brevo SMTP setup",
    });
    console.log("Test email sent ✔");
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

sendTestEmail();
