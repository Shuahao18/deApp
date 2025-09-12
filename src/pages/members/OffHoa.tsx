// src/pages/HOAOfficials.tsx
import { useState } from "react";
import { MoreVertical } from "lucide-react";

interface Member {
  id: string;
  name: string;
  role: string;
  contact: string;
  email: string;
  dateElected: string;
  termDuration: string;
  profileImage?: string;
}

const sampleMembers: Member[] = [
  {
    id: "1",
    name: "John Doe",
    role: "President",
    contact: "0912-345-6789",
    email: "john@example.com",
    dateElected: "2022-01-01",
    termDuration: "2 years",
    profileImage: "",
  },
  {
    id: "2",
    name: "Jane Smith",
    role: "Vice President",
    contact: "0917-111-2222",
    email: "jane@example.com",
    dateElected: "2023-05-01",
    termDuration: "2 years",
    profileImage: "",
  },
];

export default function OffHoa() {
  const [members, setMembers] = useState<Member[]>(sampleMembers);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState<Member>({
    id: "",
    name: "",
    role: "",
    contact: "",
    email: "",
    dateElected: "",
    termDuration: "",
    profileImage: "",
  });

  const [error, setError] = useState<string>("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setError(""); // clear error when user changes input
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profileImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation: only one President allowed
    if (
      formData.role === "President" &&
      members.some((m) => m.role === "President")
    ) {
      setError("Conflict on Assigning role is accord");
      return;
    }

    setMembers([...members, { ...formData, id: Date.now().toString() }]);
    setFormData({
      id: "",
      name: "",
      role: "",
      contact: "",
      email: "",
      dateElected: "",
      termDuration: "",
      profileImage: "",
    });
    setError("");
    setShowModal(false);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <h1 className="text-2xl font-semibold mb-6">HOA Board of members</h1>

      {/* Tabs (RESTORED) */}
      <div className="flex gap-4 mb-6 border-b pb-2">
        {[
          "HOA Boards of members",
          "Sport committee",
          "Waste management",
          "Security Committee",
        ].map((tab) => (
          <button
            key={tab}
            className="px-4 py-2 text-sm font-medium rounded-md hover:bg-gray-100"
          >
            {tab}
          </button>
        ))}
        <button
          onClick={() => setShowModal(true)}
          className="ml-auto bg-green-700 text-white px-4 py-2 rounded-md hover:bg-green-800"
        >
          + Add members
        </button>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center bg-white shadow-md rounded-xl overflow-hidden"
          >
            <div className="w-1/3 bg-gray-200 h-40 flex items-center justify-center">
              {m.profileImage ? (
                <img
                  src={m.profileImage}
                  alt={m.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-600 font-medium">+ Add Image</span>
              )}
            </div>
            <div className="w-2/63 bg-green-800 text-white p-4 relative">
              <button className="absolute top-2 right-2 text-white">
                <MoreVertical />
              </button>
              <p>
                <span className="font-semibold">Name:</span> {m.name}
              </p>
              <p>
                <span className="font-semibold">Role:</span> {m.role}
              </p>
              <p>
                <span className="font-semibold">Contact:</span> {m.contact}
              </p>
              <p>
                <span className="font-semibold">Email:</span> {m.email}
              </p>
              <p>
                <span className="font-semibold">Date Elected:</span>{" "}
                {m.dateElected}
              </p>
              <p>
                <span className="font-semibold">Term:</span> {m.termDuration}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-4xl">
            <h2 className="text-xl font-semibold mb-4">Add Member</h2>

            {/* FORM */}
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-6">
              {/* Image Upload */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-400 rounded-lg h-64 cursor-pointer">
                {formData.profileImage ? (
                  <img
                    src={formData.profileImage}
                    alt="Preview"
                    className="w-full h-full object-cover rounded-md"
                  />
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
                    <span className="text-gray-500">+ Add Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Right Side Inputs */}
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium">Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm font-medium">Role in HOA *</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    required
                    className={`w-full border-b outline-none px-2 py-1 ${
                      error ? "border-red-500 text-red-600 font-semibold" : "border-gray-400"
                    }`}
                  >
                    <option value="">Select Role</option>
                    <option value="President">President</option>
                    <option value="Vice President">Vice President</option>
                    <option value="Secretary">Secretary</option>
                    <option value="Treasurer">Treasurer</option>
                  </select>
                  {error && (
                    <p className="text-red-500 text-sm mt-1 italic">{error}</p>
                  )}
                </div>

                {/* Contact */}
                <div>
                  <label className="block text-sm font-medium">Contact No. *</label>
                  <input
                    type="text"
                    name="contact"
                    value={formData.contact}
                    onChange={handleChange}
                    required
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>

                {/* Date Elected */}
                <div>
                  <label className="block text-sm font-medium">Date Elected *</label>
                  <input
                    type="date"
                    name="dateElected"
                    value={formData.dateElected}
                    onChange={handleChange}
                    required
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>

                {/* Term */}
                <div>
                  <label className="block text-sm font-medium">Term Duration</label>
                  <input
                    type="text"
                    name="termDuration"
                    value={formData.termDuration}
                    onChange={handleChange}
                    placeholder="e.g. 2 years"
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="col-span-2 flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-green-700 text-white px-4 py-2 rounded-md hover:bg-green-800"
                >
                  Create Acc.
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
