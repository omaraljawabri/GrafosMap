import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "./ui/dialog";
import { Button } from "./ui/button";

const teamMembers = [
  { name: "Omar Al Jawabri", role: "Full-Stack", initials: "OJ" },
  { name: "Stephano Viglio", role: "Full-Stack", initials: "SV" },
  { name: "Hugo Borges", role: "Full-Stack", initials: "HB" },
  { name: "Pedro Augusto", role: "Full-Stack", initials: "PA" },
  { name: "Rodrigo Luiz", role: "Full-Stack", initials: "RL" },
];

export default function TeamModal() {
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="text-xl">Nossa Equipe</DialogTitle>
      </DialogHeader>

      <div className="space-y-12 py-6">
        {teamMembers.map((member) => (
          <div key={member.name} className="flex items-center space-x-3">
            <div className="h-14 w-14 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
              {member.initials}
            </div>
            <div>
              <p className="font-medium">{member.name}</p>
              <p className="text-sm text-gray-500">{member.role}</p>
            </div>
          </div>
        ))}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Fechar</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
