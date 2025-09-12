import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc, // <--- Add this
  runTransaction, // <--- Add this
  increment, // <--- Add this
} from "firebase/firestore";
import { db, auth } from "../Firebase";
import { onAuthStateChanged } from "firebase/auth";

interface Post {
  id?: string;
  authorId: string;
  authorName: string;
  category: string;
  content: string;
  imageUrl?: string;
  createdAt?: any;
  updatedAt?: any;
  commentsCount: number;
  reactsCount: number;
  pinned?: boolean;
}

interface Comment {
  id?: string;
  userId: string;
  authorName: string;
  content: string;
  createdAt?: any;
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [user, setUser] = useState<any>(null);

  // Comments state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState("");

  // Track logged-in user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch posts
  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];
      setPosts(fetchedPosts);
    });
    return () => unsubscribe();
  }, []);

  // Toggle comments view
  const handleViewComments = (postId: string) => {
    if (selectedPostId === postId) {
      setSelectedPostId(null); // collapse if already open
      return;
    }

    setSelectedPostId(postId);

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

    return unsubscribe;
  };

  // Add new comment
  const handleAddComment = async (postId: string) => {
    if (!newComment.trim()) return;
    if (!user) {
      alert("You must be logged in to comment.");
      return;
    }

    try {
      // Use a Firestore transaction to ensure both operations succeed or fail together.
      const postRef = doc(db, "posts", postId);

      await runTransaction(db, async (transaction) => {
        // Step 1: Add the new comment to the subcollection
        await addDoc(collection(db, "posts", postId, "comments"), {
          userId: user.uid,
          authorName: user.displayName || "HOA Member",
          content: newComment,
          createdAt: serverTimestamp(),
        });

        // Step 2: Atomically increment the commentsCount on the parent post document
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

  // ✅ UI
  return (
    <div className="flex flex-col lg:flex-row gap-6 bg-gray-100 min-h-screen p-6">
      {/* Left Column - Posts */}
      <div className="flex flex-col w-full lg:w-2/3">
        <h1 className="text-2xl font-bold text-green-800 mb-4">All Entries</h1>

        {posts.length === 0 && (
          <div className="text-gray-500 text-center mt-8">No posts yet</div>
        )}

        {posts.map((post) => (
          <div key={post.id} className="bg-white p-4 rounded shadow mb-4">
            {/* Post Header */}
            <div className="flex justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={post.imageUrl || "https://via.placeholder.com/40"}
                  alt="profile"
                  className="rounded-full"
                />
                <div>
                  <p className="font-semibold">{post.authorName}</p>
                  <p className="text-xs text-gray-500">
                    {post.createdAt?.toDate
                      ? post.createdAt.toDate().toLocaleString()
                      : ""}
                  </p>
                </div>
              </div>
              <span className="text-sm text-gray-500">{post.category}</span>
            </div>

            {/* Post Content */}
            <p className="mt-3 text-gray-700">{post.content}</p>

            {/* Post Actions */}
            <div className="text-sm text-gray-500 flex gap-4 mt-4 border-t pt-2">
              <span>👍 React ({post.reactsCount})</span>
              <span
                onClick={() => handleViewComments(post.id!)}
                className="cursor-pointer hover:underline"
              >
                💬 View Comments ({post.commentsCount})
              </span>
            </div>

            {/* Comments Section */}
            {selectedPostId === post.id && (
              <div className="mt-3 border-t pt-3">
                <h4 className="font-semibold mb-2">Comments</h4>

                {comments[post.id!]?.length ? (
                  comments[post.id!].map((c) => (
                    <div key={c.id} className="mb-2">
                      <p className="text-sm">
                        <span className="font-semibold">{c.authorName}:</span>{" "}
                        {c.content}
                      </p>
                      <p className="text-xs text-gray-400">
                        {c.createdAt?.toDate
                          ? c.createdAt.toDate().toLocaleString()
                          : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No comments yet</p>
                )}

                {/* Add Comment */}
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
                    className="bg-green-600 text-white px-3 py-2 rounded"
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
      <div className="w-full lg:w-1/3 bg-gray-800 text-white p-4 rounded h-fit">
        <h2 className="text-lg font-semibold mb-4">Create post</h2>

        <div className="flex items-center gap-3 mb-3">
          <img
            src={user?.photoURL || "https://via.placeholder.com/40"}
            alt="profile"
            className="rounded-full"
          />
          <div>
            <p className="font-semibold">{user?.displayName || "(Name)"}</p>
            <span className="bg-gray-600 text-xs px-2 py-1 rounded">
              Announcement
            </span>
          </div>
        </div>

        <textarea
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-2 rounded text-black"
          rows={4}
        />

        <button
          onClick={async () => {
            if (!content.trim()) return;
            if (!user) {
              alert("You must be logged in to post.");
              return;
            }
            await addDoc(collection(db, "posts"), {
              userId: user.uid,
              authorId: user.uid,
              authorName: user.displayName || "HOA Member",
              category: "announcement",
              content,
              imageUrl: "",
              commentsCount: 0,
              reactsCount: 0,
              pinned: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            setContent("");
          }}
          className="mt-2 bg-green-600 hover:bg-green-700 w-full py-2 rounded"
        >
          Upload
        </button>
      </div>
    </div>
  );
}