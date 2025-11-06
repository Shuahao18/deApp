import React, { useEffect, useMemo, useState } from "react";
import { FiClock, FiPlus, FiXCircle } from "react-icons/fi";
import { FaUsers, FaCheckCircle } from "react-icons/fa";
import { db, storage } from "../Firebase";
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  Timestamp,
  doc,
  writeBatch,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

// Toast notifications
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// The Candidate type reflects the data to be saved to Firestore
type Candidate = {
  name: string;
  position: string;
  termDuration: string;
  photoURL: string;
};

// Updated type for the data you want to display on the dashboard
type DisplayCandidate = {
  id: string;
  name: string;
  position: string;
  votes: number;
  photoURL: string;
};

// Type for election details
type ElectionDetails = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};

type Election = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  endTimestamp?: Timestamp;
};

const resetElectionForm = () => ({
  title: "",
  date: "",
  startTime: "",
  endTime: "",
});

const resetCandidateForm = () => ({
  name: "",
  position: "President",
  termDuration: "",
  imageFile: null as File | null,
});

// Helper for assigning a display order to positions
const POSITION_ORDER = [
  "President",
  "Vice President",
  "Treasurer",
  "Secretary",
];

export default function ElectionDashboard() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [votingActive, setVotingActive] = useState<boolean>(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [electionAlreadyExists, setElectionAlreadyExists] = useState<boolean>(false);
  const [activePosition, setActivePosition] = useState<string>("President");
  const [activeElectionId, setActiveElectionId] = useState<string | null>(null);
  const [activeElectionTitle, setActiveElectionTitle] = useState<string>("");

  const [allCandidatesFromFirestore, setAllCandidatesFromFirestore] = useState<DisplayCandidate[]>([]);

  const [electionDetails, setElectionDetails] = useState<ElectionDetails>(resetElectionForm());

  const [currentCandidate, setCurrentCandidate] = useState<{
    name: string;
    position: string;
    termDuration: string;
    imageFile: File | null;
  }>(resetCandidateForm());

  const [candidatesList, setCandidatesList] = useState<Candidate[]>([]);

  const [voterStats, setVoterStats] = useState({
    total: 0, // Only Active members
    voted: 0, // Only votes from Active members
    notVoted: 0, // Only Active members who haven't voted
  });

  // Navigation hook
  const navigate = useNavigate();

  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  // Function to fetch active members count
  const fetchActiveMembers = async () => {
    try {
      const membersSnapshot = await getDocs(collection(db, "members"));

      // Count only members with "Active" status
      const activeMembers = membersSnapshot.docs.filter((doc) => {
        const memberData = doc.data();
        return memberData.status === "Active"; // Only count Active members
      });

      return activeMembers.length;
    } catch (error) {
      console.error("Failed to fetch active members:", error);
      toast.error("Failed to fetch active members");
      return 0;
    }
  };

  // New function to update remaining time
  const updateRemainingTime = (endTimestamp: Timestamp) => {
    const now = new Date();
    const endTime = endTimestamp.toDate();
    const remaining = Math.floor((endTime.getTime() - now.getTime()) / 1000);
    setDurationSeconds(Math.max(0, remaining));
  };

  const hasTallyBeenCalled = React.useRef(false);

  // The core function for ending the election - FINAL GUARANTEED TIE-BREAKING LOGIC
  const tallyVotesAndSaveOfficials = async (electionId: string) => {
    if (!electionId) {
      console.error("No active election ID provided for tallying.");
      toast.error("No active election ID provided");
      return;
    }
    if (hasTallyBeenCalled.current) {
      console.warn(
        "Tallying is already in progress or has finished. Aborting redundant call."
      );
      return;
    }
    hasTallyBeenCalled.current = true;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);

      // Step 1: Clean up old 'elected_officials' collection
      const oldOfficialsQuery = query(collection(db, "elected_officials"));
      const oldOfficialsSnapshot = await getDocs(oldOfficialsQuery);

      oldOfficialsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Step 2: Fetch all candidates for the current election
      const candidatesRef = collection(
        db,
        "elections",
        electionId,
        "candidates"
      );
      const candidatesSnapshot = await getDocs(candidatesRef);
      const candidates = candidatesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Candidate),
      }));

      // Step 3: Fetch all ACTIVE members
      const membersSnapshot = await getDocs(collection(db, "members"));
      const activeMemberIds = membersSnapshot.docs
        .filter((doc) => doc.data().status === "Active")
        .map((doc) => doc.id);

      // Step 4: Fetch votes but only from active members
      const votesRef = collection(db, "votes");
      const votesQuery = query(votesRef, where("eventId", "==", electionId));
      const votesSnapshot = await getDocs(votesQuery);

      const voteCounts = new Map<string, number>();

      votesSnapshot.docs.forEach((doc) => {
        const voteData = doc.data();
        const voterId = voteData.userId;

        // Only count votes from active members
        if (voterId && activeMemberIds.includes(voterId)) {
          if (voteData.votes && typeof voteData.votes === "object") {
            Object.keys(voteData.votes).forEach((position) => {
              const candidateId = voteData.votes[position]?.candidateId;
              const candidate = candidates.find((c) => c.id === candidateId);
              if (candidate) {
                voteCounts.set(
                  candidate.id,
                  (voteCounts.get(candidate.id) || 0) + 1
                );
              }
            });
          }
        }
      });

      // Step 5: Determine and save winners (new officials) - FINAL GUARANTEED TIE LOGIC
      const positions = [...new Set(candidates.map((c) => c.position))];
      const electedOfficialsRef = collection(db, "elected_officials");

      let totalWinners = 0;
      let totalTies = 0;
      let totalNoVotes = 0;

      console.log("=== ELECTION TALLY PROCESS STARTED ===");
      console.log(`Processing ${positions.length} positions`);

      for (const position of positions) {
        const candidatesForPosition = candidates.filter(
          (c) => c.position === position
        );
        
        console.log(`\n--- Processing Position: ${position} ---`);
        console.log(`Candidates:`, candidatesForPosition.map(c => c.name));

        // Get all candidates for this position with their vote counts
        const positionCandidates = candidatesForPosition.map(candidate => ({
          ...candidate,
          votes: voteCounts.get(candidate.id) || 0
        }));

        // Sort by votes descending
        positionCandidates.sort((a, b) => b.votes - a.votes);

        if (positionCandidates.length === 0) {
          console.log(`❌ No candidates found for position: ${position}`);
          continue;
        }

        const highestVotes = positionCandidates[0].votes;
        
        // CRITICAL: Find ALL candidates with the highest votes (not just first ones)
        const candidatesWithHighestVotes = positionCandidates.filter(candidate => candidate.votes === highestVotes);
        
        console.log(`Highest votes: ${highestVotes}`);
        console.log(`Number of candidates with highest votes: ${candidatesWithHighestVotes.length}`);
        console.log(`Candidates with highest votes:`, candidatesWithHighestVotes.map(c => `${c.name}: ${c.votes}`));

        // ULTIMATE WINNER DETERMINATION - ONLY THESE CONDITIONS ALLOW SAVING
        const hasSingleWinner = candidatesWithHighestVotes.length === 1 && highestVotes > 0;
        const hasTie = candidatesWithHighestVotes.length > 1 && highestVotes > 0;
        const hasNoValidVotes = highestVotes === 0;

        console.log(`Decision - Single Winner: ${hasSingleWinner}, Tie: ${hasTie}, No Votes: ${hasNoValidVotes}`);

        if (hasSingleWinner) {
          // ONLY save if there's exactly ONE clear winner with votes > 0
          const winningCandidate = candidatesWithHighestVotes[0];
          const winnerDocRef = doc(electedOfficialsRef);
          batch.set(winnerDocRef, {
            name: winningCandidate.name,
            position: winningCandidate.position,
            termDuration: winningCandidate.termDuration,
            photoURL: winningCandidate.photoURL,
            votes: highestVotes,
            positionIndex: POSITION_ORDER.indexOf(winningCandidate.position),
          });
          totalWinners++;
          console.log(`✅ WINNER SAVED for ${position}: ${winningCandidate.name} with ${highestVotes} votes`);
        } else if (hasTie) {
          // TIE SITUATION - ABSOLUTELY NO WINNER SAVED FOR THIS POSITION
          console.log(`❌ TIE DETECTED for ${position}: ${candidatesWithHighestVotes.length} candidates with ${highestVotes} votes each - NO WINNER SAVED`);
          console.log(`Tied candidates:`, candidatesWithHighestVotes.map(c => c.name));
          totalTies++;
        } else if (hasNoValidVotes) {
          // NO VOTES - NO WINNER SAVED
          console.log(`❌ No votes received for position: ${position} - NO WINNER SAVED`);
          totalNoVotes++;
        } else {
          // ANY OTHER SITUATION - NO WINNER SAVED (safety net)
          console.log(`❌ Unknown situation for position: ${position} - NO WINNER SAVED`);
        }
      }

      // Step 6: Delete the current election and its candidates subcollection
      const electionDocRef = doc(db, "elections", electionId);
      batch.delete(electionDocRef);

      // Execute the atomic operation
      console.log(`\n=== BATCH COMMIT SUMMARY ===`);
      console.log(`Total winners to save: ${totalWinners}`);
      console.log(`Total tied positions: ${totalTies}`);
      console.log(`Total positions with no votes: ${totalNoVotes}`);
      console.log(`Total positions processed: ${positions.length}`);
      
      // Final verification before commit
      if (totalWinners === 0) {
        console.log(`⚠️ NO WINNERS will be saved to elected_officials - collection will be empty`);
      } else {
        console.log(`✅ ${totalWinners} winner(s) will be saved to elected_officials`);
      }

      await batch.commit();

      console.log(`\n🎉 ELECTION FINALIZED SUCCESSFULLY!`);
      console.log(`Results - Winners: ${totalWinners}, Tied Positions: ${totalTies}, No Votes: ${totalNoVotes}`);
      setVotingActive(false);
      
      // Show appropriate toast message
      if (totalTies > 0 && totalWinners === 0) {
        toast.warning(`Election ended with ${totalTies} tied position(s). No winners were declared for any position.`);
      } else if (totalTies > 0) {
        toast.warning(`Election ended! ${totalWinners} winner(s) saved, but ${totalTies} position(s) tied with no winners.`);
      } else if (totalWinners === 0) {
        toast.warning(`Election ended but no winners were declared. All positions had ties or no votes.`);
      } else {
        toast.success(`Election ended successfully! ${totalWinners} official(s) have been saved.`);
      }
      
      hasTallyBeenCalled.current = false;
      window.location.reload();
    } catch (error) {
      console.error("Failed to tally votes or save officials:", error);
      toast.error("An error occurred while ending the election.");
      hasTallyBeenCalled.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch total ACTIVE voters from Firestore
  useEffect(() => {
    const fetchTotalVoters = async () => {
      const totalActiveMembers = await fetchActiveMembers();
      setVoterStats((prevStats) => ({
        ...prevStats,
        total: totalActiveMembers,
        notVoted: totalActiveMembers - prevStats.voted,
      }));
    };
    fetchTotalVoters();
  }, []);

  // Sync with Firestore for Election Data
  useEffect(() => {
    const electionQuery = query(collection(db, "elections"));

    const unsubscribeElection = onSnapshot(electionQuery, (querySnapshot) => {
      let isElectionFound = false;
      let currentElectionId: string | null = null;
      let electionEndTime: Timestamp | undefined;
      let currentElectionTitle: string = "";

      querySnapshot.forEach((doc) => {
        const electionData = doc.data() as Election;
        const now = new Date();
        const endTime = electionData.endTimestamp?.toDate();
        const remainingTime = endTime
          ? Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000))
          : 0;

        if (remainingTime > 0) {
          isElectionFound = true;
          currentElectionId = doc.id;
          electionEndTime = electionData.endTimestamp;
          currentElectionTitle = electionData.title;
        }
      });

      setElectionAlreadyExists(isElectionFound);
      setActiveElectionId(currentElectionId);
      setActiveElectionTitle(currentElectionTitle);

      if (isElectionFound && electionEndTime) {
        setVotingActive(true);
        updateRemainingTime(electionEndTime);
      } else {
        setVotingActive(false);
        setDurationSeconds(0);
        setActiveElectionTitle("");
      }
    });

    return unsubscribeElection;
  }, []);

  // Timer useEffect for voting duration
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (votingActive) {
      timer = setInterval(() => {
        setDurationSeconds((prevSeconds) => {
          if (prevSeconds <= 1) {
            if (activeElectionId) {
              tallyVotesAndSaveOfficials(activeElectionId);
            }
            return 0;
          }
          return prevSeconds - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [votingActive, activeElectionId]);

  // Consolidated useEffect for Candidates and Votes
  useEffect(() => {
    if (!activeElectionId) {
      setAllCandidatesFromFirestore([]);
      setActivePosition("President");
      // Reset to only active members count
      fetchActiveMembers().then((totalActiveMembers) => {
        setVoterStats({
          total: totalActiveMembers,
          voted: 0,
          notVoted: totalActiveMembers,
        });
      });
      return;
    }

    const candidatesCollectionRef = collection(
      db,
      "elections",
      activeElectionId,
      "candidates"
    );
    const votesCollectionRef = collection(db, "votes");

    const unsubscribeCandidates = onSnapshot(
      candidatesCollectionRef,
      (candidatesSnapshot) => {
        const candidatesData: DisplayCandidate[] = candidatesSnapshot.docs.map(
          (doc) => ({
            id: doc.id,
            ...(doc.data() as Candidate),
            votes: 0,
          })
        );
        setAllCandidatesFromFirestore(candidatesData);

        // Now, set up the votes listener after candidates are fetched
        const votesQuery = query(
          votesCollectionRef,
          where("eventId", "==", activeElectionId)
        );

        const unsubscribeVotes = onSnapshot(
          votesQuery,
          async (votesSnapshot) => {
            const uniqueVoters = new Set<string>();
            const voteCounts = new Map<string, number>();

            // First, get all active members to validate voters
            const membersSnapshot = await getDocs(collection(db, "members"));
            const activeMemberIds = membersSnapshot.docs
              .filter((doc) => doc.data().status === "Active")
              .map((doc) => doc.id);

            votesSnapshot.docs.forEach((doc) => {
              const voteData = doc.data();
              const voterId = voteData.userId;

              // Only count votes from active members
              if (voterId && activeMemberIds.includes(voterId)) {
                uniqueVoters.add(voterId);
              }

              if (voteData.votes && typeof voteData.votes === "object") {
                Object.keys(voteData.votes).forEach((position) => {
                  const candidateId = voteData.votes[position]?.candidateId;
                  const candidateInfo = candidatesData.find(
                    (c) => c.id === candidateId
                  );
                  if (candidateInfo) {
                    const currentCount = voteCounts.get(candidateInfo.id) || 0;
                    voteCounts.set(candidateInfo.id, currentCount + 1);
                  }
                });
              }
            });

            // Update voter stats - only active members are considered
            const votedCount = uniqueVoters.size;
            const totalActiveMembers = activeMemberIds.length;

            setVoterStats({
              total: totalActiveMembers,
              voted: votedCount,
              notVoted: totalActiveMembers - votedCount,
            });

            // Update candidate vote counts
            setAllCandidatesFromFirestore((prevCandidates) => {
              return prevCandidates.map((candidate) => {
                const votes = voteCounts.get(candidate.id) || 0;
                return {
                  ...candidate,
                  votes: votes,
                };
              });
            });
          }
        );

        return unsubscribeVotes;
      }
    );

    return unsubscribeCandidates;
  }, [activeElectionId]);

  const formatDuration = (s: number): string => {
    const hh = Math.floor(s / 3600)
      .toString()
      .padStart(2, "0");
    const mm = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const handleElectionChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setElectionDetails((prev) => ({ ...prev, [name]: value }));
  };

  const handleCandidateChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setCurrentCandidate((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCurrentCandidate((prev) => ({ ...prev, imageFile: file }));
    }
  };

  const handleAddCandidateToList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !currentCandidate.name ||
      !currentCandidate.position ||
      !currentCandidate.imageFile
    ) {
      toast.warning("Please fill out all candidate fields and upload an image.");
      return;
    }

    setIsSubmitting(true);
    let photoURL = "";
    try {
      const uniqueFileName = `${Date.now()}_${currentCandidate.imageFile.name}`;
      const storageRef = ref(storage, `candidates/${uniqueFileName}`);

      await uploadBytes(storageRef, currentCandidate.imageFile);
      photoURL = await getDownloadURL(storageRef);

      const newCandidate: Candidate = {
        name: currentCandidate.name,
        position: currentCandidate.position,
        termDuration: currentCandidate.termDuration,
        photoURL: photoURL,
      };

      setCandidatesList((prev) => [...prev, newCandidate]);
      setCurrentCandidate(resetCandidateForm());
      toast.success("Candidate added successfully!");
    } catch (error) {
      console.error("Error uploading image: ", error);
      toast.error("Failed to upload image. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveElection = async () => {
    if (!electionDetails.title || !candidatesList.length) {
      toast.warning("Please provide an election title and at least one candidate.");
      return;
    }

    if (!electionDetails.date || !electionDetails.startTime || !electionDetails.endTime) {
      toast.warning("Please set the voting schedule first to enable the election process.");
      return;
    }

    setIsSubmitting(true);
    try {
      const electionEndDate = new Date(
        `${electionDetails.date}T${electionDetails.endTime}`
      );
      const electionStartDate = new Date(
        `${electionDetails.date}T${electionDetails.startTime}`
      );

      if (electionEndDate.getTime() <= electionStartDate.getTime()) {
        toast.error("End time must be after start time.");
        setIsSubmitting(false);
        return;
      }
      if (electionEndDate.getTime() <= Date.now()) {
        toast.error("Election must be scheduled in the future.");
        setIsSubmitting(false);
        return;
      }

      const batch = writeBatch(db);

      const newElectionRef = doc(collection(db, "elections"));

      batch.set(newElectionRef, {
        title: electionDetails.title,
        date: electionDetails.date,
        startTime: electionDetails.startTime,
        endTime: electionDetails.endTime,
        createdAt: new Date(),
        endTimestamp: Timestamp.fromDate(electionEndDate),
      });

      candidatesList.forEach((candidate) => {
        const candidateRef = doc(collection(newElectionRef, "candidates"));
        batch.set(candidateRef, candidate);
      });

      await batch.commit();

      console.log("Election and candidates saved with ID: ", newElectionRef.id);

      setElectionDetails(resetElectionForm());
      setCandidatesList([]);
      setShowForm(false);

      setActiveElectionId(newElectionRef.id);
      toast.success("Election created successfully!");
    } catch (error) {
      console.error("Error saving election: ", error);
      toast.error("Failed to save election. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopVoting = async () => {
    if (!activeElectionId) {
      toast.warning("No active election to stop.");
      return;
    }

    // Custom confirmation modal
    const userConfirmed = window.confirm(
      "Are you sure you want to stop the election? This action cannot be undone."
    );

    if (!userConfirmed) {
      return;
    }

    await tallyVotesAndSaveOfficials(activeElectionId);
  };

  const filteredCandidates = useMemo(() => {
    return allCandidatesFromFirestore.filter(
      (c) => c.position === activePosition
    );
  }, [allCandidatesFromFirestore, activePosition]);

  const allPositions = useMemo(() => {
    const positions = allCandidatesFromFirestore.map((c) => c.position);
    return [...new Set(positions)].sort(
      (a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b)
    );
  }, [allCandidatesFromFirestore]);

  // Check if election schedule is complete
  const isElectionScheduleComplete = useMemo(() => {
    return electionDetails.date && electionDetails.startTime && electionDetails.endTime;
  }, [electionDetails.date, electionDetails.startTime, electionDetails.endTime]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Toast Container */}
      <div className="toast-container">
        {/* This will be used by react-toastify */}
      </div>

      {/* UPDATED HEADER - Same as Dashboard */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-4 sm:px-6 flex justify-between items-center flex-shrink-0">
        {/* Page Title - Left Side */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel">
            Election Module
          </h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div
            className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
            onClick={handleAdminClick}
          >
            <UserCircleIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            <span className="text-sm font-medium hidden sm:inline">Admin</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="bg-object text-gray-100 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="font-semibold text-sm sm:text-base">Election Status</div>
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="bg-object text-white px-2 sm:px-3 py-1 rounded border border-gray-600 text-sm w-full sm:w-auto"
                >
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                  <option value={2023}>2023</option>
                </select>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-1 sm:gap-2 bg-emerald-700 text-white px-2 sm:px-3 py-1 rounded shadow disabled:bg-gray-500 text-sm w-full sm:w-auto justify-center"
                  disabled={electionAlreadyExists}
                >
                  <FiPlus className="w-3 h-3 sm:w-4 sm:h-4" /> 
                  <span className="hidden sm:inline">New Election</span>
                  <span className="sm:hidden">New</span>
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {/* Responsive Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
                <div className="relative bg-white border rounded shadow-sm px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
                  <div className="border-l-4 border-amber-400 pl-2 sm:pl-4">
                    <div className="text-xs sm:text-sm text-amber-500">Total Voters</div>
                    <div className="text-lg sm:text-2xl font-semibold">
                      {voterStats.total}
                    </div>
                  </div>
                  <div className="ml-auto text-xl sm:text-3xl text-amber-400">
                    <FaUsers />
                  </div>
                </div>

                <div className="bg-white border rounded shadow-sm px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
                  <div className="border-l-4 border-emerald-700 pl-2 sm:pl-4">
                    <div className="text-xs sm:text-sm text-emerald-700">Voted</div>
                    <div className="text-lg sm:text-2xl font-semibold">
                      {voterStats.voted}
                    </div>
                  </div>
                  <div className="ml-auto text-xl sm:text-3xl text-emerald-700">
                    <FaCheckCircle />
                  </div>
                </div>

                <div className="bg-white border rounded shadow-sm px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
                  <div className="border-l-4 border-red-500 pl-2 sm:pl-4">
                    <div className="text-xs sm:text-sm text-red-500">Not Voted</div>
                    <div className="text-lg sm:text-2xl font-semibold">
                      {voterStats.notVoted}
                    </div>
                  </div>
                  <div className="ml-auto text-xl sm:text-3xl text-red-500">
                    <FiXCircle />
                  </div>
                </div>

                <div className="bg-white border rounded shadow-sm px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
                  <div className="border-l-4 border-gray-400 pl-2 sm:pl-4">
                    <div className="text-xs sm:text-sm text-gray-600">Voting Duration</div>
                    <div className="text-lg sm:text-2xl font-semibold">
                      {formatDuration(durationSeconds)}
                    </div>
                  </div>
                  <div className="ml-auto text-xl sm:text-3xl text-gray-600">
                    <FiClock />
                  </div>
                </div>
              </div>

              {/* Main Content Area - Responsive Layout */}
              <div className="mt-6 sm:mt-8 bg-white border rounded shadow-sm flex flex-col lg:flex-row">
                {/* Sidebar - Horizontal on mobile, Vertical on larger screens */}
                <aside className="w-full lg:w-48 bg-object text-white p-4 lg:p-6">
                  <nav className="flex lg:flex-col gap-3 lg:gap-6 text-sm overflow-x-auto lg:overflow-x-visible">
                    {allPositions.map((position) => (
                      <button
                        key={position}
                        onClick={() => setActivePosition(position)}
                        className={`whitespace-nowrap text-left px-3 py-2 rounded ${
                          activePosition === position
                            ? "font-bold bg-emerald-700 text-white"
                            : "text-white hover:bg-emerald-700/50 transition"
                        }`}
                      >
                        {position}
                      </button>
                    ))}
                  </nav>
                </aside>

                {/* Main Content */}
                <div className="flex-1 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                    <h2 className="text-lg sm:text-xl font-semibold">
                      {activeElectionTitle
                        ? `${activeElectionTitle} - ${year}`
                        : `Voting Count Election ${year}`}
                    </h2>
                    <div>
                      {votingActive && (
                        <button
                          onClick={handleStopVoting}
                          className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded disabled:bg-gray-400 text-sm w-full sm:w-auto justify-center"
                          disabled={!votingActive || isSubmitting}
                        >
                          <FiXCircle /> Stop Voting
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 sm:mt-6 bg-gray-50 border rounded p-4 sm:p-8 shadow-inner">
                    {filteredCandidates.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 items-start text-center">
                        {filteredCandidates.map((c) => (
                          <div
                            key={c.id}
                            className="flex flex-col items-center gap-3 sm:gap-4 bg-white p-3 sm:p-4 rounded-lg shadow"
                          >
                            {c.photoURL ? (
                              <img
                                src={c.photoURL}
                                alt={c.name}
                                className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-full object-cover border-4 border-emerald-500"
                              />
                            ) : (
                              <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-full bg-gray-300 flex items-center justify-center text-xs sm:text-sm text-gray-500">
                                No Image
                              </div>
                            )}
                            <div className="text-base sm:text-lg font-bold">{c.name}</div>
                            <div className="text-xs sm:text-sm text-gray-600 font-medium">
                              {c.position}
                            </div>
                            <div className="w-24 sm:w-36 bg-emerald-100 border border-emerald-300 rounded-md py-2 sm:py-3 text-lg sm:text-2xl font-bold text-emerald-800">
                              {c.votes}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500">Votes</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 p-4 sm:p-8">
                        {votingActive ? (
                          <>
                            <p className="text-base sm:text-xl font-medium">
                              Walang kandidato para sa posisyon na ito.
                            </p>
                            <p className="text-xs sm:text-sm mt-2">
                              Pumili ng ibang posisyon sa itaas/kaliwa.
                            </p>
                          </>
                        ) : (
                          <p className="text-base sm:text-xl font-medium">
                            Walang aktibong eleksyon. Pindutin ang "New Election" para magsimula.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL - RESPONSIVE */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
            <div className="p-4 sm:p-6 relative">
              <button
                onClick={() => {
                  setShowForm(false);
                  setCandidatesList([]);
                }}
                className="absolute top-2 right-2 text-gray-600 hover:text-black text-2xl"
              >
                ✕
              </button>

              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 border-b pb-2">
                Create New Election
              </h2>

              {/* Election Details - Responsive Grid */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3 text-base sm:text-lg text-emerald-700">
                  Election Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium">
                      Election Title
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500 text-sm sm:text-base"
                      name="title"
                      value={electionDetails.title}
                      onChange={handleElectionChange}
                      disabled={electionAlreadyExists}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">
                      Election Date
                    </label>
                    <input
                      type="date"
                      className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500 text-sm sm:text-base"
                      name="date"
                      value={electionDetails.date}
                      onChange={handleElectionChange}
                      disabled={electionAlreadyExists}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">
                      Voting Time Duration
                    </label>
                    <div className="flex gap-2 mt-1">
                      <p>start</p>
                      <input
                        type="time"
                        className="w-full border rounded px-3 py-2 focus:border-emerald-500 text-sm sm:text-base"
                        name="startTime"
                        value={electionDetails.startTime}
                        onChange={handleElectionChange}
                        disabled={electionAlreadyExists}
                      />
                      
                       <p>end</p>
                      <input
                        type="time"
                        className="w-full border rounded px-3 py-2 focus:border-emerald-500 text-sm sm:text-base"
                        name="endTime"
                        value={electionDetails.endTime}
                        onChange={handleElectionChange}
                        disabled={electionAlreadyExists}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Add Candidates Section - Responsive Grid */}
              <div className="border p-3 sm:p-4 rounded-lg bg-gray-50">
                <h3 className="font-semibold mb-3 text-base sm:text-lg text-emerald-700">
                  Add Candidates
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium">
                      Candidate Name
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500 text-sm"
                      name="name"
                      value={currentCandidate.name}
                      onChange={handleCandidateChange}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium">Position</label>
                    <select
                      className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500 text-sm"
                      name="position"
                      value={currentCandidate.position}
                      onChange={handleCandidateChange}
                    >
                      {POSITION_ORDER.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium">
                      Term Duration
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., 2 Years"
                      className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500 text-sm"
                      name="termDuration"
                      value={currentCandidate.termDuration}
                      onChange={handleCandidateChange}
                    />
                  </div>
                  <div className="sm:col-span-1 relative flex items-center justify-center border-2 border-dashed rounded h-16 sm:h-20 bg-white hover:border-emerald-500 transition">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={handleFileChange}
                    />
                    {currentCandidate.imageFile ? (
                      <img
                        src={URL.createObjectURL(currentCandidate.imageFile)}
                        alt="Preview"
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <span className="text-gray-500 text-xs sm:text-sm text-center px-2">
                        Tap to Add Image
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddCandidateToList}
                  disabled={
                    isSubmitting ||
                    !currentCandidate.name ||
                    !currentCandidate.imageFile
                  }
                  className="mt-4 bg-emerald-700 text-white px-3 sm:px-4 py-2 rounded hover:bg-emerald-800 disabled:bg-gray-400 text-xs sm:text-sm w-full sm:w-auto"
                >
                  {isSubmitting ? "Uploading..." : "+ Add Candidate to List"}
                </button>
              </div>

              {/* Candidates List - Responsive */}
              {candidatesList.length > 0 && (
                <div className="mt-4 sm:mt-6 p-3 sm:p-4 border rounded bg-white">
                  <h4 className="font-semibold mb-2 text-sm sm:text-base">
                    Candidates Ready for Election:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div className="font-bold hidden sm:block">Name</div>
                    <div className="font-bold hidden sm:block">Position</div>
                    <div className="font-bold hidden sm:block">Term</div>
                    <div className="font-bold hidden sm:block">Action</div>
                    {candidatesList.map((c, index) => (
                      <React.Fragment key={index}>
                        <div className="sm:col-span-1 font-semibold sm:font-normal">
                          <span className="sm:hidden font-semibold">Name: </span>
                          {c.name}
                        </div>
                        <div className="sm:col-span-1">
                          <span className="sm:hidden font-semibold">Position: </span>
                          {c.position}
                        </div>
                        <div className="sm:col-span-1">
                          <span className="sm:hidden font-semibold">Term: </span>
                          {c.termDuration || "N/A"}
                        </div>
                        <div className="sm:col-span-1">
                          <button
                            onClick={() =>
                              setCandidatesList((prev) =>
                                prev.filter((_, i) => i !== index)
                              )
                            }
                            className="text-red-500 hover:text-red-700 text-xs w-full sm:w-auto text-left sm:text-center"
                          >
                            Remove
                          </button>
                        </div>
                        {index < candidatesList.length - 1 && (
                          <div className="col-span-full border-b my-2 sm:hidden"></div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div className="mt-4 sm:mt-6 text-right pt-4 border-t">
                <button
                  onClick={handleSaveElection}
                  disabled={
                    isSubmitting ||
                    !candidatesList.length ||
                    !electionDetails.title ||
                    !isElectionScheduleComplete
                  }
                  className="relative bg-emerald-700 text-white px-4 sm:px-6 py-2 rounded-lg shadow hover:bg-emerald-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm sm:text-base w-full sm:w-auto transition-all duration-200 group"
                >
                  {isSubmitting ? (
                    "Saving Election..."
                  ) : (
                    <>
                      Save and Start Election
                      {!isElectionScheduleComplete && (
                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                          <span className="text-white text-xs font-bold">!</span>
                        </div>
                      )}
                    </>
                  )}
                </button>
                
                {/* Tooltip for disabled state */}
                {!isElectionScheduleComplete && (
                  <div className="mt-2 text-xs text-red-500 text-center">
                    ⚠️ Please complete the election schedule first
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}