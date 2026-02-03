import mongoose from "mongoose"

const UserSchema = new mongoose.Schema(
    {
        firebaseUid: { type: String, required: true, unique: true, index: true },
        email: { type: String, index: true },
        displayName: { type: String },
        photoUrl: { type: String, default: null },
        phoneNumber: { type: String, default: null },
        role: { type: String, default: "user" },
        status: { type: String, default: "active" },
        privacy: { type: Object, default: {} },
        notificationSettings: { type: Object, default: {} },
        lastLoginAt: { type: Date, default: null },
    },
    { timestamps: true }
)

export default mongoose.model("User", UserSchema)
