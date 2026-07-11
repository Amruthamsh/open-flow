import { Routes, Route } from "react-router-dom";
import { Pet } from "./pages/Pet";
import { Chat } from "./pages/Chat";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Pet />} />
      <Route path="/chat" element={<Chat />} />
    </Routes>
  );
}
