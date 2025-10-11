import { useState, useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, runTransaction, increment, getDoc, deleteDoc, writeBatch, getDocs, updateDoc,
} from "firebase/firestore";
import { db, auth, storage } from "../Firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable,
} from "firebase/storage";

// 🌟 UPDATE: Added authorPhotoURL for author image stability 🌟
interface Post {
    id?: string;
    authorId: string;
    authorName: string;
    authorPhotoURL?: string | null; // <--- ADDED
    category: string;
    content: string;
    imageUrl?: string; // This seems redundant with authorPhotoURL, but kept for compatibility.
    mediaUrl?: string;
    mediaType?: string;
    createdAt?: any;
    updatedAt?: any;
    commentsCount: number;
    reactsCount: number;
    pinned?: boolean;
}

// 🌟 UPDATE: Added photoURL for displaying comment author image 🌟
interface Comment {
    id?: string;
    userId: string;
    authorName?: string;
    user?: string;
    content?: string;
    text?: string;
    photoURL?: string | null; // <--- ADDED
    createdAt?: any;
}

interface ReactUser {
    id?: string;
    userId: string;
    authorName: string;
    photoURL?: string | null;
    createdAt?: any;
}

// -----------------------------------------------------------
// Main App Component
// -----------------------------------------------------------

export default function App() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [content, setContent] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("announcement");
    const [user, setUser] = useState<any>(null);
    const [isAdmin, setIsAdmin] = useState(false);

    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFileName, setSelectedFileName] = useState("");
    const [uploadProgress, setUploadProgress] = useState(0);

    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
    const [comments, setComments] = useState<Record<string, Comment[]>>({});
    const [newComment, setNewComment] = useState("");

    const [selectedReactPostId, setSelectedReactPostId] = useState<string | null>(
        null
    );
    const [reacts, setReacts] = useState<Record<string, ReactUser[]>>({});
    const [showReactsModal, setShowReactsModal] = useState(false);
    
    // 🌟 EDIT POST STATE 🌟
    const [isEditing, setIsEditing] = useState(false);
    const [editingPost, setEditingPost] = useState<Post | null>(null);
    const [editedContent, setEditedContent] = useState("");
    const [editedCategory, setEditedCategory] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);


    const getFileType = (file: File): string => {
        if (file.type.startsWith("image/")) return "image";
        if (file.type.startsWith("video/")) return "video";
        if (file.type.startsWith("audio/")) return "audio";
        if (file.type === "application/pdf") return "pdf";
        if (
            file.type.includes("document") ||
            file.type.includes("text") ||
            file.type.includes("sheet") ||
            file.type.includes("presentation")
        )
            return "document";
        return "file";
    };

    const generateUniqueFileName = (file: File, userId: string): string => {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const fileExtension = file.name.split(".").pop();
        return `${userId}_${timestamp}_${randomString}.${fileExtension}`;
    };

    const compressImage = (file: File): Promise<File> => {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();

            img.onload = () => {
                let { width, height } = img;
                const maxSize = 1200;

                if (width > height && width > maxSize) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;

                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: "image/jpeg",
                                lastModified: Date.now(),
                            });
                            resolve(compressedFile);
                        } else {
                            resolve(file);
                        }
                    },
                    "image/jpeg",
                    0.8
                );
            };

            img.src = URL.createObjectURL(file);
        });
    };

    const getAuthorLabel = async (uid: string, fallback: string): Promise<string> => {
        try {
            // 1. Titingnan kung Admin ang user
            const adminDoc = await getDoc(doc(db, "admin", uid));
            if (adminDoc.exists()) {
                return adminDoc.data().role || "Admin"; // Ibalik ang role kung Admin
            }

            // 2. Kung hindi Admin, hahanapin sa 'member' collection
            // Note: You referenced 'reacts' collection in the original, I assume you meant 'members'
            const memberDoc = await getDoc(doc(db, "members", uid)); 
            if (memberDoc.exists()) {
                const data = memberDoc.data();
                const firstName = data.firstName || '';
                const surname = data.surname || '';
                
                // Ibalik ang pinagsamang First Name at Surname
                if (firstName || surname) {
                    return `${firstName} ${surname}`.trim();
                }
            }

            // 3. Kung wala sa admin at member, gamitin ang fallback (displayName mula sa Auth)
            return fallback || "HOA Member"; 

        } catch (e) {
            console.error("Error fetching author label:", e);
            return fallback || "HOA Member"; // Fallback kung may error
        }
    };
    
    const uploadFileToStorage = async (
        file: File
    ): Promise<{ url: string; type: string; filePath: string }> => {
        try {
            let fileToUpload = file;
            if (file.type.startsWith("image/") && file.size > 1024 * 1024) {
                fileToUpload = await compressImage(file);
            }

            const uniqueFileName = generateUniqueFileName(fileToUpload, user.uid);
            const fileType = getFileType(fileToUpload);
            const storagePath = `posts/${fileType}s/${uniqueFileName}`;
            const storageRef = ref(storage, storagePath);

            const uploadTask = uploadBytesResumable(storageRef, fileToUpload, {
                customMetadata: {
                    uploadedBy: user.uid,
                    originalName: file.name,
                    uploadTime: new Date().toISOString(),
                },
                cacheControl: "public,max-age=3600",
            });

            return new Promise((resolve, reject) => {
                uploadTask.on(
                    "state_changed",
                    (snapshot) => {
                        const progress =
                            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadProgress(Math.round(progress * 0.8));
                    },
                    (error) => {
                        console.error("Upload error:", error);
                        reject(error);
                    },
                    async () => {
                        try {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve({
                                url: downloadURL,
                                type: fileType,
                                filePath: storagePath,
                            });
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            });
        } catch (error) {
            console.error("Error uploading file to storage:", error);
            throw error;
        }
    };

    // --- useEffects ---

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                try {
                    const adminDoc = await getDoc(doc(db, "admin", currentUser.uid));
                    setIsAdmin(adminDoc.exists());
                } catch (error) {
                    console.error("Error checking admin status:", error);
                    setIsAdmin(false);
                }
            } else {
                setIsAdmin(false);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "posts"), orderBy("pinned", "desc"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPosts = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Post[];
            setPosts(fetchedPosts);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!selectedReactPostId) return;

        const q = query(
            collection(db, "posts", selectedReactPostId, "reacts"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedReacts = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as ReactUser[];
            setReacts((prev) => ({ ...prev, [selectedReactPostId]: fetchedReacts }));
        });

        return () => unsubscribe();
    }, [selectedReactPostId]);

    // --- Post/Comment Handlers ---

    const handleViewComments = (postId: string) => {
        if (selectedPostId === postId) {
            setSelectedPostId(null);
            return;
        }
        setSelectedPostId(postId);

        // Fetch comments and keep listening for real-time updates
        const q = query(
            collection(db, "posts", postId, "comments"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedComments = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Comment[];
            setComments((prev) => ({ ...prev, [postId]: fetchedComments }));
        });

        // Cleanup the listener when component unmounts or post changes
        // Since this is inside another handler, it needs careful cleanup.
        // For simplicity in this example, we return the unsubscribe function, 
        // but in a real app, you'd manage these in a separate useEffect or state.
        return () => unsubscribe(); 
    };

    const handleAddComment = async (postId: string) => {
        if (!newComment.trim()) return;
        if (!user) {
            alert("You must be logged in to comment.");
            return;
        }
        try {
            const postRef = doc(db, "posts", postId);
            await runTransaction(db, async (transaction) => {
                const authorName = await getAuthorLabel(user.uid, user.displayName);
                await addDoc(collection(db, "posts", postId, "comments"), {
                    userId: user.uid,
                    authorName,
                    content: newComment,
                    photoURL: user.photoURL || null, // 🌟 FIX 1: Nagdagdag ng photoURL sa comment 🌟
                    createdAt: serverTimestamp(),
                });
                transaction.update(postRef, {
                    commentsCount: increment(1),
                });
            });
            setNewComment("");
        } catch (err) {
            console.error("Error commenting:", err);
            alert("Failed to add comment. Check console.");
        }
    };

    const handleToggleReact = async (postId: string) => {
        if (!user) {
            alert("You must be logged in to react.");
            return;
        }
        const postRef = doc(db, "posts", postId);
        const reactRef = doc(db, "posts", postId, "reacts", user.uid);
        try {
            await runTransaction(db, async (transaction) => {
                const reactDoc = await transaction.get(reactRef);
                if (reactDoc.exists()) {
                    transaction.delete(reactRef);
                    transaction.update(postRef, { reactsCount: increment(-1) });
                } else {
                    const authorName = await getAuthorLabel(user.uid, user.displayName);
                    transaction.set(reactRef, {
                        userId: user.uid,
                        authorName,
                        photoURL: user.photoURL || null,
                        createdAt: serverTimestamp(),
                    });
                    transaction.update(postRef, { reactsCount: increment(1) });
                }
            });
        } catch (err) {
            console.error("Error toggling react:", err);
        }
    };
    
    const handleCreatePost = async () => {
        if (!content.trim() && !fileToUpload) {
            alert("Please add content or attach a file.");
            return;
        }
        if (!user || !isAdmin) {
            alert("You do not have permission to create a post.");
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        let mediaUrl = "";
        let mediaType = "";
        let mediaPath = "";

        try {
            if (fileToUpload) {
                setUploadProgress(5);
                const uploadResult = await uploadFileToStorage(fileToUpload);
                mediaUrl = uploadResult.url;
                mediaType = uploadResult.type;
                mediaPath = uploadResult.filePath;
                setUploadProgress(85);
            }

            const authorLabel = await getAuthorLabel(user.uid, user.displayName);
            setUploadProgress(90);

            await addDoc(collection(db, "posts"), {
                userId: user.uid,
                authorId: user.uid,
                authorName: authorLabel,
                authorPhotoURL: user.photoURL || null, // 🌟 FIX 2: Nagdagdag ng authorPhotoURL 🌟
                category: selectedCategory,
                content: content.trim(),
                imageUrl: user.photoURL || null, // Paggamit ng user.photoURL bilang fallback
                commentsCount: 0,
                reactsCount: 0,
                pinned: false,
                mediaUrl: mediaUrl || null,
                mediaType: mediaType || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            setUploadProgress(100);
            handleCancelPost(); // Reset form
        } catch (err) {
            console.error("Error creating post:", err);
            if (fileToUpload && mediaPath) {
                try {
                    await deleteObject(ref(storage, mediaPath));
                    console.log("Successfully cleaned up orphaned file.");
                } catch (cleanupErr) {
                    console.error("Failed to clean up orphaned file:", cleanupErr);
                }
            }
            alert("Failed to create post. Please try again.");
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleCancelPost = () => {
        setContent("");
        setSelectedCategory("announcement");
        setFileToUpload(null);
        setSelectedFileName("");
        setUploadProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset file input
        }
    };

    // 🌟 NEW FUNCTION: handlePinPost 🌟
    const handlePinPost = async (postId: string, currentPinStatus: boolean) => {
        if (!user || !isAdmin) {
            alert("Only an admin can pin or unpin a post.");
            return;
        }

        const newPinStatus = !currentPinStatus;
        const action = newPinStatus ? "pin" : "unpin";

        if (!window.confirm(`Are you sure you want to ${action} this post?`)) {
            return;
        }

        try {
            const postRef = doc(db, "posts", postId);
            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) {
                    throw "Post does not exist!";
                }

                transaction.update(postRef, {
                    pinned: newPinStatus,
                    updatedAt: serverTimestamp(),
                });
            });
            console.log(`Post ${postId} successfully ${action}ned.`);
        } catch (err) {
            console.error(`Error ${action}ning post:`, err);
            alert(`Failed to ${action} post. Please try again.`);
        }
    };
    
    // 🌟 NEW FUNCTION: handleEditPost 🌟
    const openEditModal = (post: Post) => {
        if (!user || (!isAdmin && user.uid !== post.authorId)) {
            alert("You do not have permission to edit this post.");
            return;
        }
        setEditingPost(post);
        setEditedContent(post.content);
        setEditedCategory(post.category);
        setIsEditing(true);
    };

    const handleEditPost = async () => {
        if (!editingPost) return;
        if (!editedContent.trim()) {
            alert("Post content cannot be empty.");
            return;
        }

        try {
            const postRef = doc(db, "posts", editingPost.id!);

            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) {
                    throw "Post does not exist!";
                }

                transaction.update(postRef, {
                    content: editedContent.trim(),
                    category: editedCategory,
                    updatedAt: serverTimestamp(),
                });
            });

            alert("Post updated successfully!");
            setIsEditing(false);
            setEditingPost(null);
        } catch (err) {
            console.error("Error editing post:", err);
            alert("Failed to edit post. Please try again.");
        }
    };

    const handleDeletePost = async (post: Post) => {
        if (!user) {
            alert("You must be logged in to delete a post.");
            return;
        }

        const isAuthor = user.uid === post.authorId;
        if (!isAuthor && !isAdmin) {
            alert("You do not have permission to delete this post.");
            return;
        }

        if (window.confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
            try {
                const batch = writeBatch(db);
                const postRef = doc(db, "posts", post.id!);

                const commentsSnapshot = await getDocs(collection(postRef, "comments"));
                commentsSnapshot.forEach((commentDoc) => {
                    batch.delete(commentDoc.ref);
                });

                const reactsSnapshot = await getDocs(collection(postRef, "reacts"));
                reactsSnapshot.forEach((reactDoc) => {
                    batch.delete(reactDoc.ref);
                });
                
                batch.delete(postRef);
                await batch.commit();

                // Delete file from storage using mediaUrl (more reliable method)
                if (post.mediaUrl) {
                    try {
                        const fileRef = ref(storage, post.mediaUrl);
                        await deleteObject(fileRef);
                    } catch (storageError) {
                        console.warn("Failed to delete file from storage. It may not exist.", storageError);
                    }
                }

                console.log("Post and all associated data deleted successfully.");
            } catch (err) {
                console.error("Error deleting post:", err);
                alert("Failed to delete post. Please check the console for details.");
            }
        }
    };


    // --- UI/Helper Functions ---

    const openReactsModal = (postId: string) => {
        setSelectedReactPostId(postId);
        setShowReactsModal(true);
    };

    const closeReactsModal = () => {
        setSelectedReactPostId(null);
        setShowReactsModal(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const maxSize = 20 * 1024 * 1024; // 20MB
            if (file.size > maxSize) {
                alert("File size must be less than 20MB");
                return;
            }

            const allowedTypes = [
                "image/jpeg", "image/png", "image/gif", "image/webp",
                "video/mp4", "video/webm", "video/ogg",
                "audio/mp3", "audio/wav", "audio/ogg",
                "application/pdf",
                "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .doc, .docx
                "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xls, .xlsx
                "text/plain",
            ];
            if (!allowedTypes.includes(file.type)) {
                alert(
                    "File type not supported. Please upload images, videos, audio, PDF, or document files."
                );
                return;
            }
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            setFileToUpload(file);
            setSelectedFileName(`${file.name} (${fileSizeMB} MB)`);
        } else {
            setFileToUpload(null);
            setSelectedFileName("");
        }
    };

    const getRelativeTime = (timestamp: any) => {
        if (!timestamp?.toDate) return "";
        const seconds = Math.floor((new Date().getTime() - timestamp.toDate().getTime()) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return `${Math.floor(interval)}y ago`;
        interval = seconds / 2592000;
        if (interval > 1) return `${Math.floor(interval)}mo ago`;
        interval = seconds / 86400;
        if (interval > 1) return `${Math.floor(interval)}d ago`;
        interval = seconds / 3600;
        if (interval > 1) return `${Math.floor(interval)}h ago`;
        interval = seconds / 60;
        if (interval > 1) return `${Math.floor(interval)}m ago`;
        return `${Math.floor(seconds)}s ago`;
    };
    
    // Function to render media content (image, video, etc.)
    const renderMediaContent = (post: Post) => {
        if (!post.mediaUrl) {
            return null;
        }

        const mediaType = post.mediaType || "file";
        const defaultImageUrl = "https://via.placeholder.com/500x300.png?text=File+Preview"; // Fallback image

        switch (mediaType) {
            case "image":
                return (
                    <img
                        src={post.mediaUrl}
                        alt="Post Media"
                        className="mt-4 rounded-lg w-full max-h-[500px] object-contain cursor-pointer"
                        onClick={() => window.open(post.mediaUrl, "_blank")}
                    />
                );
            case "video":
                return (
                    <video
                        src={post.mediaUrl}
                        controls
                        className="mt-4 rounded-lg w-full max-h-[500px]"
                    />
                );
            case "audio":
                return <audio src={post.mediaUrl} controls className="mt-4 w-full" />;
            case "pdf":
            case "document":
            case "file":
                return (
                    <div className="mt-4 p-4 border rounded-lg bg-gray-50 flex items-center justify-between">
                        <a
                            href={post.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:underline"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="w-6 h-6"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19.5 14.25v-2.25H15a3 3 0 0 0-3-3m0 0a3 3 0 0 0-3 3m3-3a3 3 0 0 1 3 3m-3-3V1.5m6 0h.008v.008h-.008ZM12 6.538V12m6 1.838a6 6 0 1 0-11.996.386m-6 3.65a6 6 0 1 0 11.996-.386M21 21v-3.75a3 3 0 0 0-3-3m-3 3H5.25m3.75 0V7.5a3 3 0 0 1 3-3m-3-3a3 3 0 0 1 3 3m-3-3V1.5m6 0h.008v.008h-.008ZM12 6.538V12m6 1.838a6 6 0 1 0-11.996.386"
                                />
                            </svg>
                            <span>View file: {post.mediaType}</span>
                        </a>
                    </div>
                );
            default:
                return null;
        }
    };
    
    // Default image URL for user profile picture
    // const defaultProfilePic = "https://via.placeholder.com/150/0000FF/FFFFFF?text=USER"; 


    return (
        <div className="bg-teader p-6 h-20 "> 
            <h1 className="text-2xl text-white font-semibold">HOA Officials</h1>
        
            <div className="flex flex-col lg:flex-row m-8 gap-6 bg-gray-100 min-h-screen ">
                {/* Left Column - Posts */}
                <div className="flex flex-col w-full lg:w-2/3">
                    

                    {posts.length === 0 && (
                        <div className="text-gray-500 text-center mt-8">No posts yet</div>
                    )}

                    {posts.map((post) => (
                        <div key={post.id} className="bg-white p-4 rounded shadow mb-4">
                            {/* Post Header */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <img
                                        src={post.authorPhotoURL}
                                        alt="profile"
                                        className="rounded-full w-10 h-10 object-cover"
                                    />
                                    <div className="flex flex-col">
                                        <p className="font-semibold text-gray-800">
                                            {post.authorName}
                                            {/* Pinned Tag */}
                                            {post.pinned && (
                                                <span className="ml-2 px-2 py-0.5 text-xs font-medium text-blue-800 bg-blue-100 rounded-full">
                                                    PINNED
                                                </span>
                                            )}
                                        </p>
                                        <span className="text-xs text-gray-500">
                                            {getRelativeTime(post.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                <span className="text-sm text-gray-500 capitalize px-2 py-1 bg-gray-200 rounded">
                                    {post.category}
                                </span>
                            </div>

                            {/* Post Content */}
                            <p className="mt-3 text-gray-700 whitespace-pre-line">
                                {post.content}
                            </p>

                            {/* Render media content based on type */}
                            {renderMediaContent(post)}

                            {/* Reactions and Comments Count */}
                            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                                <div className="flex items-center gap-1 cursor-pointer hover:underline" onClick={() => openReactsModal(post.id!)}>
                                    <span>{post.reactsCount}</span>
                                    <span>Reacts</span>
                                </div>
                                <div className="flex items-center gap-1 cursor-pointer hover:underline" onClick={() => handleViewComments(post.id!)}>
                                    <span>{post.commentsCount}</span>
                                    <span>Comment</span>
                                </div>
                            </div>

                            {/* Post Actions */}
                            <div className="flex gap-1 mt-2 border-t pt-3 justify-around">
                                {/* React Button */}
                                <button
                                    className="flex-1 flex items-center justify-center gap-2 p-2 rounded hover:bg-gray-100 transition"
                                    onClick={() => handleToggleReact(post.id!)}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={1.5}
                                        stroke="currentColor"
                                        className="w-5 h-5"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M6.633 10.5c.875 0 1.575.696 1.575 1.554v3.528a2.91 2.91 0 0 1-.508 1.637m-2.164-3.528H6.633m1.575 0h-1.575m0 0L5.341 6.375a3 3 0 0 1 5.952-.37L12 9l.707-.707a3 3 0 0 1 4.243 0l.707.707"
                                        />
                                    </svg>
                                    <span className="text-sm font-semibold text-gray-700">React</span>
                                </button>
                                {/* Comment Button */}
                                <button
                                    className="flex-1 flex items-center justify-center gap-2 p-2 rounded hover:bg-gray-100 transition"
                                    onClick={() => handleViewComments(post.id!)}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={1.5}
                                        stroke="currentColor"
                                        className="w-5 h-5"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M16.862 14.862a3 3 0 0 0-4.243-4.243M9.75 6H15a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25h-5.25a2.25 2.25 0 0 1-2.25-2.25V10.5a3 3 0 0 0 4.5-5.25"
                                        />
                                    </svg>
                                    <span className="text-sm font-semibold text-gray-700">Comment</span>
                                </button>

                                {/* 🌟 IMPLEMENTED: Pin Post Button (Admin Only) 🌟 */}
                                {isAdmin && (
                                    <button
                                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded transition ${post.pinned ? 'bg-blue-500 text-white hover:bg-blue-600' : 'hover:bg-gray-100'}`}
                                        onClick={() => handlePinPost(post.id!, post.pinned || false)}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill={post.pinned ? "currentColor" : "none"}
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke={post.pinned ? "none" : "currentColor"}
                                            className="w-5 h-5"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.514 48.514 0 0 1 11.186 0Z"
                                            />
                                        </svg>
                                        <span className={`text-sm font-semibold ${post.pinned ? 'text-white' : 'text-gray-700'}`}>
                                            {post.pinned ? "Unpin post" : "Pin post"}
                                        </span>
                                    </button>
                                )}
                                
                                {/* Edit and Delete Buttons (Admin or Author Only) */}
                                {(isAdmin || user?.uid === post.authorId) && (
                                    <>
                                        {/* 🌟 IMPLEMENTED: Edit Post Button 🌟 */}
                                        <button
                                            className="flex-1 flex items-center justify-center gap-2 p-2 rounded hover:bg-gray-100 transition"
                                            onClick={() => openEditModal(post)}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={1.5}
                                                stroke="currentColor"
                                                className="w-5 h-5"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.2-8.2Z"
                                                />
                                            </svg>
                                            <span className="text-sm font-semibold text-gray-700">Edit post</span>
                                        </button>
                                        <button
                                            className="flex-1 flex items-center justify-center gap-2 p-2 rounded hover:bg-gray-100 transition"
                                            onClick={() => handleDeletePost(post)}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={1.5}
                                                stroke="currentColor"
                                                className="w-5 h-5"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.179H8.163a2.25 2.25 0 0 1-2.244-2.179L4.252 6.432m2.76-2.617a3 3 0 0 0-2.825 2.824v12.28a3 3 0 0 0 2.824 2.825h12.28a3 3 0 0 0 2.825-2.824V6.215a3 3 0 0 0-2.824-2.825H8.76"
                                                />
                                            </svg>
                                            <span className="text-sm font-semibold text-gray-700">Delete</span>
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Comments Section */}
                            {selectedPostId === post.id && (
                                <div className="mt-3 border-t pt-3">
                                    <h4 className="font-semibold mb-2">Comments</h4>

                                    {comments[post.id!]?.length ? (
                                        comments[post.id!].map((c) => (
                                            <div key={c.id} className="mb-2 flex items-start gap-2 p-2 bg-gray-50 rounded">
                                                {/* 🌟 IMPLEMENTED: Comment Author Image 🌟 */}
                                                <img
                                                    src={c.photoURL}
                                                    alt="commenter"
                                                    className="w-7 h-7 rounded-full object-cover mt-1 flex-shrink-0"
                                                />
                                                <div>
                                                    <p className="text-sm">
                                                        <span className="font-semibold text-gray-800">
                                                            {c.authorName || c.user}
                                                        </span>{" "}
                                                        {c.content || c.text}
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        {c.createdAt?.toDate
                                                            ? c.createdAt.toDate().toLocaleString()
                                                            : ""}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500">No comments yet</p>
                                    )}

                                    <div className="flex gap-2 mt-3">
                                        <input
                                            type="text"
                                            placeholder="Write a comment..."
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            className="flex-1 p-2 border rounded"
                                        />
                                        <button
                                            onClick={() => handleAddComment(post.id!)}
                                            className="bg-green-600 text-white px-3 py-2 rounded disabled:opacity-50"
                                            disabled={!newComment.trim() || !user}
                                        >
                                            Send
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Right Column - Create Post */}
                {isAdmin && (
                    <div className="w-full lg:w-1/3 bg-white rounded shadow h-fit">
                        {/* 🔹 Black Header */}
                        <div className="bg-object text-white px-6 py-3 rounded-t">
                            <h2 className="text-lg font-semibold">Create post</h2>
                        </div>
                        
                        <div className="p-4">
                            <div className="flex items-center gap-3 mb-4">
                                <img
                                    src={user?.photoURL}
                                    alt="profile"
                                    className="rounded-full w-10 h-10 object-cover"
                                />
                                <p className="font-semibold text-gray-800">
                                    {user?.displayName || "(Name)"}
                                </p>
                                <div className="flex items-center gap-2 ml-auto">
                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="px-2 py-1 border rounded text-sm text-gray-600"
                                    >
                                        <option value="announcement">Announcement</option>
                                        <option value="complaint">Complaint</option>
                                        <option value="general">General</option>
                                    </select>
                                    <label className="flex items-center gap-1 px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300 cursor-pointer">
                                        <span className="text-lg">📎</span>
                                        <span>Attach Files</span>
                                        <input
                                            type="file"
                                            className="hidden"
                                            onChange={handleFileChange}
                                            ref={fileInputRef}
                                            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                        />
                                    </label>
                                </div>
                            </div>

                            {selectedFileName && (
                                <div className="text-sm text-gray-600 mb-2 p-2 bg-gray-50 rounded">
                                    <strong>Selected file:</strong> {selectedFileName}
                                    <button
                                        onClick={() => {
                                            setFileToUpload(null);
                                            setSelectedFileName("");
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        className="ml-2 text-red-600 hover:text-red-800"
                                    >
                                        ✕ Remove
                                    </button>
                                </div>
                            )}

                            {isUploading && uploadProgress > 0 && (
                                <div className="mb-4">
                                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                                        <span>Uploading...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}

                            <textarea
                                placeholder="Type a post"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full p-4 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
                                rows={6}
                                disabled={isUploading}
                            />

                            <div className="flex justify-end gap-2 mt-4 border-t pt-4">
                                <button
                                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                                    onClick={handleCancelPost}
                                    disabled={isUploading}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreatePost}
                                    disabled={isUploading || (!content.trim() && !fileToUpload)}
                                    className={`px-6 py-2 rounded ${
                                        isUploading || (!content.trim() && !fileToUpload)
                                            ? "bg-green-300 cursor-not-allowed text-white"
                                            : "bg-green-600 hover:bg-green-700 text-white"
                                    }`}
                                >
                                    {isUploading ? "Uploading..." : "Upload"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Reacts Modal */}
                {showReactsModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-lg w-full max-w-sm mx-4 p-4">
                            <div className="flex justify-between items-center border-b pb-2 mb-4">
                                <h3 className="font-bold text-lg">Reacts</h3>
                                <button
                                    onClick={closeReactsModal}
                                    className="text-gray-500 hover:text-gray-700 text-2xl"
                                >
                                    &times;
                                </button>
                            </div>

                            {reacts[selectedReactPostId!]?.length > 0 ? (
                                <div className="max-h-80 overflow-y-auto">
                                    {reacts[selectedReactPostId!]?.map((r) => (
                                        <div
                                            key={r.id}
                                            className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded"
                                        >
                                            <img
                                                src={r.photoURL}
                                                alt="profile"
                                                className="rounded-full w-8 h-8 object-cover"
                                            />
                                            <p className="font-semibold text-gray-800">
                                                {r.authorName || "HOA Member"}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-4">No reacts yet.</p>
                            )}
                        </div>
                    </div>
                )}
                
                {/* 🌟 IMPLEMENTED: Edit Post Modal 🌟 */}
                {isEditing && editingPost && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
                            <h3 className="font-bold text-xl mb-4 border-b pb-2">Edit Post</h3>
                            
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                <select
                                    value={editedCategory}
                                    onChange={(e) => setEditedCategory(e.target.value)}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value="announcement">Announcement</option>
                                    <option value="complaint">Complaint</option>
                                    <option value="general">General</option>
                                </select>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                                <textarea
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="w-full p-3 border rounded resize-none focus:ring-blue-500 focus:border-blue-500"
                                    rows={8}
                                />
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditingPost(null);
                                    }}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEditPost}
                                    disabled={!editedContent.trim()}
                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}