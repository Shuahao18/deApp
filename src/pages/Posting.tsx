import { useState } from "react";

interface Post {
  name: string;
  category: string;
  time: string;
  content: string;
  image?: string;
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");

  const handlePost = () => {
    if (!content.trim()) return;

    const newPost: Post = {
      name: "(Name)",
      category: "Announcement",
      time: new Date().toLocaleString(),
      content,
    };

    setPosts([newPost, ...posts]);
    setContent("");
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 bg-gray-100 min-h-screen p-6">
      {/* Left Column - View All Posts */}
      <div className="flex flex-col w-full lg:w-2/3">
        <h1 className="text-2xl font-bold text-green-800 mb-4">View All</h1>

        {posts.length === 0 && (
          <div className="text-gray-500 text-center mt-8">No posts yet</div>
        )}

        {posts.map((post, index) => (
          <div key={index} className="bg-white p-4 rounded shadow mb-4">
            {/* Post Header */}
            <div className="flex justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="https://via.placeholder.com/40"
                  alt="profile"
                  className="rounded-full"
                />
                <div>
                  <p className="font-semibold">{post.name}</p>
                  <p className="text-xs text-gray-500">{post.time}</p>
                </div>
              </div>
              <span className="text-sm text-gray-500">{post.category}</span>
            </div>

            {/* Post Content */}
            <p className="mt-3 text-gray-700">{post.content}</p>

            {post.image && (
              <img
                src={post.image}
                alt="post"
                className="mt-3 rounded max-h-60 object-cover"
              />
            )}

            {/* Post Actions */}
            <div className="text-sm text-gray-500 flex gap-4 mt-4 border-t pt-2">
              <span>👍 React</span>
              <span>💬 Comment</span>
              <span>📌 Pin post</span>
              <span>✏️ Edit post</span>
              <span>🗑️ Delete</span>
            </div>
          </div>
        ))}
      </div>

      {/* Right Column - Create Post */}
      <div className="w-full lg:w-1/3 bg-gray-800 text-white p-4 rounded h-fit">
        <h2 className="text-lg font-semibold mb-4">Create post</h2>

        {/* User Info */}
        <div className="flex items-center gap-3 mb-3">
          <img
            src="https://via.placeholder.com/40"
            alt="profile"
            className="rounded-full"
          />
          <div>
            <p className="font-semibold">(Name)</p>
            <span className="bg-gray-600 text-xs px-2 py-1 rounded">
              Category
            </span>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-2 rounded text-black"
          rows={4}
        />

        {/* Post Button */}
        <button
          onClick={handlePost}
          className="mt-2 bg-blue-500 hover:bg-blue-600 w-full py-2 rounded"
        >
          Post
        </button>
      </div>
    </div>
  );
}
