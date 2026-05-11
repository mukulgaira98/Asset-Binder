import { useState, useEffect, useCallback, useRef } from "react";
import { 
  useListProjects, 
  useCreateProject, 
  useUpdateProject,
  useDeleteProject,
  useCompileSketch,
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  getListProjectsQueryKey,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { Play, Save, FilePlus, Cpu, MessageSquare, Terminal, Zap, Wand2, Wrench, Upload, MoreHorizontal, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const BOARDS = ["Uno", "Mega 2560", "Nano", "Pro Mini", "Leonardo", "Due", "Zero", "MKR WiFi 1010"];

export default function IDE() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [board, setBoard] = useState(BOARDS[0]);
  const [terminalOutput, setTerminalOutput] = useState("CodexFrame initialized.\nReady.");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [lastCompileError, setLastCompileError] = useState("");
  
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectBoard, setNewProjectBoard] = useState(BOARDS[0]);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Queries
  const { data: projects } = useListProjects();
  const { data: conversations } = useListOpenaiConversations();
  
  // Setup default conversation if none
  useEffect(() => {
    if (conversations && conversations.length > 0 && !conversationId) {
      setConversationId(conversations[0].id);
    }
  }, [conversations, conversationId]);

  const { data: conversationData } = useGetOpenaiConversation(conversationId || 0, {
    query: { enabled: !!conversationId, queryKey: getGetOpenaiConversationQueryKey(conversationId || 0) }
  });

  useEffect(() => {
    if (conversationData?.messages) {
      setChatMessages(conversationData.messages);
    }
  }, [conversationData]);

  // Mutations
  const createProject = useCreateProject();
  const createConversation = useCreateOpenaiConversation();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const compileSketch = useCompileSketch();

  const handleSelectProject = (id: number) => {
    const p = projects?.find(p => p.id === id);
    if (p) {
      setSelectedProjectId(id);
      setCode(p.code);
      setBoard(p.board);
      setTerminalOutput(`Loaded project: ${p.name}`);
    }
  };

  const handleCreateProject = () => {
    createProject.mutate({
      data: { name: newProjectName || "New Sketch", board: newProjectBoard, code: "void setup() {\n  \n}\n\nvoid loop() {\n  \n}\n" }
    }, {
      onSuccess: (p) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setIsNewProjectOpen(false);
        handleSelectProject(p.id);
        setNewProjectName("");
      }
    });
  };

  const handleRenameOpen = (id: number, currentName: string) => {
    setRenameProjectId(id);
    setRenameValue(currentName);
    setIsRenameOpen(true);
  };

  const handleRenameConfirm = () => {
    if (!renameProjectId || !renameValue.trim()) return;
    updateProject.mutate(
      { id: renameProjectId, data: { name: renameValue.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Project renamed" });
          setIsRenameOpen(false);
        },
      }
    );
  };

  const handleDeleteProject = (id: number, name: string) => {
    deleteProject.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          if (selectedProjectId === id) {
            setSelectedProjectId(null);
            setCode("");
          }
          toast({ title: `"${name}" deleted` });
        },
      }
    );
  };

  const handleSave = () => {
    if (!selectedProjectId) return;
    updateProject.mutate({
      id: selectedProjectId,
      data: { code, board }
    }, {
      onSuccess: () => {
        toast({ title: "Project saved", description: "Your code has been saved." });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      }
    });
  };

  const handleCompile = () => {
    if (!code) return;
    setTerminalOutput("Compiling sketch...");
    setLastCompileError("");
    
    compileSketch.mutate({
      data: { code, board }
    }, {
      onSuccess: (data) => {
        setTerminalOutput(data.output || (data.errors && data.errors.length > 0 ? data.errors.join('\n') : "Compilation finished."));
        if (data.success) {
          toast({ title: "Compilation successful", description: `Binary size: ${data.binarySize} bytes` });
        } else {
          toast({ title: "Compilation failed", variant: "destructive" });
          if (data.errors && data.errors.length > 0) {
            setLastCompileError(data.errors.join('\n'));
          }
        }
      },
      onError: (err) => {
        setTerminalOutput("Error during compilation request.");
        toast({ title: "Compilation request failed", variant: "destructive" });
      }
    });
  };

  const handleUpload = () => {
    toast({ title: "Uploading...", description: "Connecting to board..." });
    setTerminalOutput(prev => prev + "\n\nSimulating upload to " + board + "...\nUpload complete. 100%");
  };

  const handleAIGenerate = async () => {
    const prompt = window.prompt("What should the AI generate?");
    if (!prompt) return;
    
    setTerminalOutput("Generating code via AI...");
    
    try {
      const response = await fetch('/api/ai/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, board, context: code })
      });
      
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) {
              setCode(prev => prev + data.content);
            }
          }
        }
      }
      setTerminalOutput(prev => prev + "\nAI Generation complete.");
    } catch(e) {
      setTerminalOutput(prev => prev + "\nAI Generation failed.");
    }
  };

  const handleAIFix = async () => {
    if (!code) return;
    setTerminalOutput("Analyzing code and errors...");
    
    try {
      const response = await fetch('/api/ai/fix-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, error: lastCompileError || "General review", board })
      });
      
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      setCode(""); // Clear before streaming replacement
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) {
              setCode(prev => prev + data.content);
            }
          }
        }
      }
      setTerminalOutput(prev => prev + "\nAI Fix complete.");
    } catch(e) {
      setTerminalOutput(prev => prev + "\nAI Fix failed.");
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;

    let activeConversationId = conversationId;

    // Auto-create a conversation if none exists yet
    if (!activeConversationId) {
      try {
        const conv = await new Promise<{ id: number }>((resolve, reject) => {
          createConversation.mutate(
            { data: { title: "Arduino Assistant" } },
            {
              onSuccess: (data) => {
                setConversationId(data.id);
                queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
                resolve(data);
              },
              onError: reject,
            }
          );
        });
        activeConversationId = conv.id;
      } catch {
        toast({ title: "Could not start conversation", variant: "destructive" });
        return;
      }
    }

    const userMsg = chatInput;
    setChatInput("");
    setChatMessages(prev => [...prev, { id: Date.now(), role: "user", content: userMsg }]);
    
    try {
      const response = await fetch(`/api/openai/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMsg })
      });
      
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      let assistantMsg = "";
      setChatMessages(prev => [...prev, { id: Date.now()+1, role: "assistant", content: "" }]);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantMsg += data.content;
                setChatMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = assistantMsg;
                  return newMsgs;
                });
              }
            } catch(e) {}
          }
        }
      }
    } catch(e) {}
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Top Toolbar */}
      <header className="h-14 border-b border-border flex items-center px-4 justify-between bg-card z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <Zap className="w-5 h-5 fill-primary" />
            <span className="tracking-tighter">CodexFrame</span>
          </div>
          
          <div className="w-px h-6 bg-border mx-2"></div>
          
          <Button variant="ghost" size="sm" onClick={() => setIsNewProjectOpen(true)} className="gap-2">
            <FilePlus className="w-4 h-4" /> New
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={!selectedProjectId} className="gap-2">
            <Save className="w-4 h-4" /> Save
          </Button>
          
          <div className="w-px h-6 bg-border mx-2"></div>
          
          <Select value={board} onValueChange={setBoard}>
            <SelectTrigger className="w-[180px] h-8 bg-black/20 border-border">
              <SelectValue placeholder="Select Board" />
            </SelectTrigger>
            <SelectContent>
              {BOARDS.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button onClick={handleCompile} disabled={!selectedProjectId} size="sm" className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 gap-2">
            <Play className="w-4 h-4 fill-primary" /> Compile
          </Button>
          <Button onClick={handleUpload} disabled={!selectedProjectId} size="sm" variant="outline" className="border-border gap-2">
            <Upload className="w-4 h-4" /> Upload
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAIGenerate} disabled={!selectedProjectId} className="border-primary/50 text-primary hover:bg-primary/10 gap-2">
            <Wand2 className="w-4 h-4" /> AI Generate
          </Button>
          <Button variant="outline" size="sm" onClick={handleAIFix} disabled={!selectedProjectId} className="border-chart-2/50 text-chart-2 hover:bg-chart-2/10 gap-2">
            <Wrench className="w-4 h-4" /> AI Fix
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 border-r border-border bg-sidebar flex flex-col flex-shrink-0">
          <div className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50">
            Explorer
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 flex flex-col gap-1">
              {projects?.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  No projects yet.
                </div>
              )}
              {projects?.map(p => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors cursor-pointer ${selectedProjectId === p.id ? 'bg-primary/10 text-primary font-bold' : 'text-sidebar-foreground hover:bg-accent'}`}
                  onClick={() => handleSelectProject(p.id)}
                >
                  <Cpu className={`w-4 h-4 flex-shrink-0 ${selectedProjectId === p.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="truncate flex-1">{p.name}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={e => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded hover:bg-white/10 transition-opacity"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-44">
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); handleSelectProject(p.id); }}>
                        <FolderOpen className="w-4 h-4 mr-2 text-primary" />
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); handleRenameOpen(p.id, p.name); }}>
                        <Pencil className="w-4 h-4 mr-2 text-muted-foreground" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={e => { e.stopPropagation(); handleDeleteProject(p.id, p.name); }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Center Main Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Editor */}
          <div className="flex-1 relative bg-[#1e1e1e]">
            {selectedProjectId ? (
              <Editor
                height="100%"
                language="cpp"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val ?? '')}
                options={{ 
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 14, 
                  minimap: { enabled: false }, 
                  scrollBeyondLastLine: false,
                  padding: { top: 16 }
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Zap className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Select or create a project to start coding</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Bottom Terminal */}
          <div className="h-48 border-t border-border bg-card flex flex-col flex-shrink-0">
            <div className="h-8 border-b border-border/50 flex items-center px-4 bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Terminal className="w-3 h-3 mr-2" /> Output
            </div>
            <ScrollArea className="flex-1">
              <pre className="p-4 text-xs font-mono text-green-400/80 whitespace-pre-wrap">
                {terminalOutput}
              </pre>
            </ScrollArea>
          </div>
        </main>

        {/* Right AI Chat */}
        <aside className="w-80 border-l border-border bg-sidebar flex flex-col flex-shrink-0">
          <div className="h-14 border-b border-border flex items-center px-4 justify-between bg-card text-sm font-bold">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              AI Assistant
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-3 py-2 rounded-lg max-w-[90%] text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>
                    {msg.content || <span className="opacity-50">Thinking...</span>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <div className="p-3 border-t border-border bg-card">
            <form 
              onSubmit={e => { e.preventDefault(); handleSendChatMessage(); }}
              className="flex gap-2"
            >
              <Input 
                placeholder="Ask AI..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                className="bg-black/20 border-border focus-visible:ring-primary h-9"
              />
              <Button type="submit" size="sm" className="h-9 px-3 bg-primary text-primary-foreground">
                Send
              </Button>
            </form>
          </div>
        </aside>
      </div>

      <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>New Arduino Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input 
                value={newProjectName} 
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Blinking LED" 
                className="bg-black/20"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Board</label>
              <Select value={newProjectBoard} onValueChange={setNewProjectBoard}>
                <SelectTrigger className="bg-black/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARDS.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProject}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              placeholder="Project name"
              className="bg-black/20"
              onKeyDown={e => { if (e.key === "Enter") handleRenameConfirm(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameConfirm} disabled={!renameValue.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
