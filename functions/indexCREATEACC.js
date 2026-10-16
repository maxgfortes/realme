const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const {
    getFirestore,
    FieldValue,
    Timestamp
} = require("firebase-admin/firestore");
const { getAppCheck } = require("firebase-admin/app-check");
const crypto = require("crypto");

initializeApp();

const auth = getAuth();
const db = getFirestore();
const appCheck = getAppCheck();

const REGION = "southamerica-east1";

const IS_EMULATOR =
    process.env.FUNCTIONS_EMULATOR === "true";

const RATE_LIMITS = {
    ip: {
        max: 5,
        window: 15 * 60 * 1000
    },
    email: {
        max: 3,
        window: 60 * 60 * 1000
    },
    username: {
        max: 5,
        window: 60 * 60 * 1000
    }
};

function hash(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function normalize(value) {
    return String(value ?? "").trim();
}

function normalizeEmail(value) {
    return normalize(value).toLowerCase();
}

function normalizeUsername(value) {
    return normalize(value).toLowerCase();
}

function validName(value) {
    return /^[\p{L}\s'-]{2,40}$/u.test(value);
}

function validUsername(value) {
    return /^[a-z0-9_]{3,20}$/.test(value);
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(value);
}

function calculateAge(date) {
    const today = new Date();

    let age =
        today.getFullYear() -
        date.getFullYear();

    const monthDifference =
        today.getMonth() -
        date.getMonth();

    if (
        monthDifference < 0 ||
        (
            monthDifference === 0 &&
            today.getDate() < date.getDate()
        )
    ) {
        age--;
    }

    return age;
}

async function checkRateLimit(key, max, windowMs) {
    const ref = db
        .collection("rateLimits")
        .doc(hash(key));

    const now = Date.now();

    return db.runTransaction(async (transaction) => {
        const snapshot =
            await transaction.get(ref);

        if (!snapshot.exists) {
            transaction.set(ref, {
                count: 1,
                windowStart: now,
                expiresAt:
                    Timestamp.fromMillis(
                        now + windowMs
                    )
            });

            return true;
        }

        const data = snapshot.data();

        if (
            now - data.windowStart >=
            windowMs
        ) {
            transaction.set(ref, {
                count: 1,
                windowStart: now,
                expiresAt:
                    Timestamp.fromMillis(
                        now + windowMs
                    )
            });

            return true;
        }

        if (data.count >= max) {
            return false;
        }

        transaction.update(ref, {
            count:
                FieldValue.increment(1)
        });

        return true;
    });
}

async function releaseUsername(username, uid) {
    const ref = db
        .collection("usernames")
        .doc(username);

    try {
        await db.runTransaction(
            async (transaction) => {
                const snapshot =
                    await transaction.get(ref);

                if (!snapshot.exists) {
                    return;
                }

                const data =
                    snapshot.data();

                if (data.uid === uid) {
                    transaction.delete(ref);
                }
            }
        );
    } catch (error) {
        console.error(
            "Failed to release username:",
            error
        );
    }
}

exports.createAccount = onRequest(
    {
        region: REGION,
        cors: IS_EMULATOR
            ? true
            : [
                "https://socialrealme.com"
            ],
        maxInstances: 5,
        concurrency: 10,
        timeoutSeconds: 30,
        memory: "256MiB"
    },
    async (req, res) => {
        res.set(
            "Cache-Control",
            "no-store"
        );

        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "METHOD_NOT_ALLOWED"
            });
        }

        if (!IS_EMULATOR) {
            const appCheckToken =
                req.get(
                    "X-Firebase-AppCheck"
                );

            if (!appCheckToken) {
                return res.status(401).json({
                    success: false,
                    error: "APP_CHECK_REQUIRED"
                });
            }

            try {
                await appCheck.verifyToken(
                    appCheckToken
                );
            } catch (error) {
                return res.status(401).json({
                    success: false,
                    error: "INVALID_APP_CHECK"
                });
            }
        }

        const ip =
            req.ip ||
            req.get("x-forwarded-for") ||
            "unknown";

        const ipAllowed =
            await checkRateLimit(
                `ip:${ip}`,
                RATE_LIMITS.ip.max,
                RATE_LIMITS.ip.window
            );

        if (!ipAllowed) {
            return res.status(429).json({
                success: false,
                error: "RATE_LIMITED"
            });
        }

        const body = req.body || {};

        const nome =
            normalize(body.nome);

        const sobrenome =
            normalize(body.sobrenome);

        const username =
            normalizeUsername(
                body.username
            );

        const email =
            normalizeEmail(body.email);

        const senha =
            String(body.senha ?? "");

        const nascimento =
            normalize(body.nascimento);

        const genero =
            normalize(body.genero);

        if (
            !nome ||
            !sobrenome ||
            !username ||
            !email ||
            !senha ||
            !nascimento ||
            !genero
        ) {
            return res.status(400).json({
                success: false,
                error: "MISSING_FIELDS"
            });
        }

        if (!validName(nome)) {
            return res.status(400).json({
                success: false,
                error: "INVALID_NAME"
            });
        }

        if (!validName(sobrenome)) {
            return res.status(400).json({
                success: false,
                error: "INVALID_SURNAME"
            });
        }

        if (!validUsername(username)) {
            return res.status(400).json({
                success: false,
                error: "INVALID_USERNAME"
            });
        }

        if (!validEmail(email)) {
            return res.status(400).json({
                success: false,
                error: "INVALID_EMAIL"
            });
        }

        if (!validPassword(senha)) {
            return res.status(400).json({
                success: false,
                error: "WEAK_PASSWORD"
            });
        }

        const birthDate =
            new Date(
                `${nascimento}T00:00:00`
            );

        if (
            Number.isNaN(
                birthDate.getTime()
            )
        ) {
            return res.status(400).json({
                success: false,
                error: "INVALID_BIRTH_DATE"
            });
        }

        if (calculateAge(birthDate) < 13) {
            return res.status(400).json({
                success: false,
                error: "UNDERAGE"
            });
        }

        const emailAllowed =
            await checkRateLimit(
                `email:${email}`,
                RATE_LIMITS.email.max,
                RATE_LIMITS.email.window
            );

        if (!emailAllowed) {
            return res.status(429).json({
                success: false,
                error: "RATE_LIMITED"
            });
        }

        const usernameAllowed =
            await checkRateLimit(
                `username:${username}`,
                RATE_LIMITS.username.max,
                RATE_LIMITS.username.window
            );

        if (!usernameAllowed) {
            return res.status(429).json({
                success: false,
                error: "RATE_LIMITED"
            });
        }

        let userRecord;

        try {
            try {
                await auth.getUserByEmail(
                    email
                );

                return res.status(409).json({
                    success: false,
                    error:
                        "EMAIL_ALREADY_IN_USE"
                });

            } catch (error) {
                if (
                    error.code !==
                    "auth/user-not-found"
                ) {
                    throw error;
                }
            }

            userRecord =
                await auth.createUser({
                    email,
                    password: senha,
                    displayName:
                        `${nome} ${sobrenome}`
                });

            const usernameRef =
                db
                    .collection("usernames")
                    .doc(username);

            const usernameClaimed =
                await db.runTransaction(
                    async (transaction) => {
                        const snapshot =
                            await transaction.get(
                                usernameRef
                            );

                        if (snapshot.exists) {
                            return false;
                        }

                        transaction.create(
                            usernameRef,
                            {
                                uid:
                                    userRecord.uid,
                                status:
                                    "active",
                                createdAt:
                                    FieldValue.serverTimestamp()
                            }
                        );

                        return true;
                    }
                );

            if (!usernameClaimed) {
                await auth.deleteUser(
                    userRecord.uid
                );

                return res.status(409).json({
                    success: false,
                    error:
                        "USERNAME_TAKEN"
                });
            }

            await db
                .collection("users")
                .doc(userRecord.uid)
                .set({
                    uid:
                        userRecord.uid,
                    username,
                    email,
                    name: nome,
                    surname: sobrenome,
                    gender: genero,
                    nascimento:
                        Timestamp.fromDate(
                            birthDate
                        ),
                    criadoem:
                        FieldValue.serverTimestamp()
                });

            return res.status(201).json({
                success: true
            });

        } catch (error) {
            console.error(
                "Account creation error:",
                error
            );

            if (userRecord?.uid) {
                try {
                    await auth.deleteUser(
                        userRecord.uid
                    );
                } catch (deleteError) {
                    console.error(
                        "Rollback Auth error:",
                        deleteError
                    );
                }

                await releaseUsername(
                    username,
                    userRecord.uid
                );
            }

            if (
                error.code ===
                "auth/email-already-exists"
            ) {
                return res.status(409).json({
                    success: false,
                    error:
                        "EMAIL_ALREADY_IN_USE"
                });
            }

            if (
                error.code ===
                "auth/invalid-password"
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "WEAK_PASSWORD"
                });
            }

            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR"
            });
        }
    }
);