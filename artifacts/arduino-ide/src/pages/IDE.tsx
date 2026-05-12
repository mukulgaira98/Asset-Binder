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
import { Play, Save, FilePlus, Cpu, MessageSquare, Terminal, Zap, Wand2, Wrench, Upload, MoreHorizontal, FolderOpen, Pencil, Trash2, Usb, X, ChevronDown, ChevronUp, Activity, SquarePen, Copy, Paperclip, Check, PlusSquare, Clock, ArrowLeft } from "lucide-react";
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

  // Chat panel extras
  const [chatTitleOverride, setChatTitleOverride] = useState("");
  const [isEditingChatTitle, setIsEditingChatTitle] = useState(false);
  const [chatTitleEdit, setChatTitleEdit] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [copiedChat, setCopiedChat] = useState(false);
  const [showRecentChats, setShowRecentChats] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const newChatModeRef = useRef(false);
  
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectBoard, setNewProjectBoard] = useState(BOARDS[0]);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Serial / board connection state
  const [isConnected, setIsConnected] = useState(false);
  const [portName, setPortName] = useState("");
  const [baudRate, setBaudRate] = useState("9600");
  const [boardPanelOpen, setBoardPanelOpen] = useState(false);
  const [serialLog, setSerialLog] = useState<string[]>([]);
  const serialPortRef = useRef<SerialPort | null>(null);
  const serialReaderRef = useRef<ReadableStreamDefaultReader | null>(null);
  const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  // Queries
  const { data: projects } = useListProjects();
  const { data: conversations } = useListOpenaiConversations();
  
  // Setup default conversation if none (skipped when user clicked New Chat)
  useEffect(() => {
    if (newChatModeRef.current) return;
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
      // Always open a fresh chat when switching projects
      newChatModeRef.current = true;
      setConversationId(null);
      setChatMessages([]);
      setChatTitleOverride("");
      setAttachedFile(null);
      setChatInput("");
      setShowRecentChats(false);
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

  const handleConnectBoard = async () => {
    if (!serialSupported) {
      toast({ title: "Web Serial not supported", description: "Use Chrome or Edge for board connection.", variant: "destructive" });
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: parseInt(baudRate) });
      serialPortRef.current = port;

      const info = port.getInfo();
      const pid = info.usbProductId?.toString(16).toUpperCase().padStart(4, "0");
      const vid = info.usbVendorId?.toString(16).toUpperCase().padStart(4, "0");
      setPortName(pid && vid ? `USB VID:${vid} PID:${pid}` : "Serial Port");
      setIsConnected(true);
      setBoardPanelOpen(true);
      setSerialLog([`[${new Date().toLocaleTimeString()}] Board connected at ${baudRate} baud.`]);
      setTerminalOutput(prev => prev + `\nBoard connected at ${baudRate} baud.`);
      toast({ title: "Board connected" });

      // Start reading serial data
      const readLoop = async () => {
        const reader = port.readable.getReader();
        serialReaderRef.current = reader;
        const decoder = new TextDecoder();
        let lineBuffer = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.trim()) {
                const entry = `[${new Date().toLocaleTimeString()}] ${line.trim()}`;
                setSerialLog(prev => [...prev.slice(-99), entry]);
              }
            }
          }
        } catch { /* port closed */ }
      };
      readLoop();
    } catch (err: any) {
      if (err?.name !== "NotFoundError") {
        toast({ title: "Connection failed", description: err?.message, variant: "destructive" });
      }
    }
  };

  const handleDisconnectBoard = async () => {
    try {
      serialReaderRef.current?.cancel();
      await serialPortRef.current?.close();
    } catch { /* ignore */ }
    serialPortRef.current = null;
    serialReaderRef.current = null;
    setIsConnected(false);
    setPortName("");
    setSerialLog([]);
    setBoardPanelOpen(false);
    setTerminalOutput(prev => prev + "\nBoard disconnected.");
    toast({ title: "Board disconnected" });
  };

  const handleNewChat = () => {
    newChatModeRef.current = true;
    setConversationId(null);
    setChatMessages([]);
    setChatTitleOverride("");
    setAttachedFile(null);
    setChatInput("");
    setShowRecentChats(false);
  };

  const handleLoadConversation = (id: number) => {
    newChatModeRef.current = false;
    setConversationId(id);
    setChatMessages([]);
    setChatTitleOverride("");
    setAttachedFile(null);
    setChatInput("");
    setShowRecentChats(false);
  };

  const handleCopyChat = async () => {
    if (!chatMessages.length) return;
    const text = chatMessages
      .map(m => `${m.role === "user" ? "You" : "AI"}: ${m.content}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopiedChat(true);
    setTimeout(() => setCopiedChat(false), 2000);
    toast({ title: "Chat copied to clipboard" });
  };

  const handleStartEditTitle = () => {
    const current = chatTitleOverride || (conversationData as any)?.title || "Arduino Assistant";
    setChatTitleEdit(current);
    setIsEditingChatTitle(true);
  };

  const handleConfirmEditTitle = () => {
    if (chatTitleEdit.trim()) setChatTitleOverride(chatTitleEdit.trim());
    setIsEditingChatTitle(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setAttachedFile({ name: file.name, content });
      toast({ title: `File attached: ${file.name}` });
    };
    reader.readAsText(file);
    e.target.value = "";
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
                newChatModeRef.current = false;
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
    const fileCtx = attachedFile
      ? `\n\n[Attached file: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\``
      : "";
    const fullContent = userMsg + fileCtx;
    setChatInput("");
    setAttachedFile(null);
    setChatMessages(prev => [...prev, { id: Date.now(), role: "user", content: fullContent }]);
    
    try {
      const response = await fetch(`/api/openai/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullContent })
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
            <div className="flex flex-col leading-none">
              <span className="tracking-tighter">CodexFrame</span>
              <span className="text-[9px] font-normal text-muted-foreground tracking-wide">Designed by Mukul Gaira</span>
            </div>
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

          <div className="w-px h-6 bg-border mx-1" />

          {isConnected ? (
            <button
              onClick={() => setBoardPanelOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/15 border border-green-500/40 text-green-400 text-xs font-medium hover:bg-green-500/25 transition-colors"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
              </span>
              Connected
              {boardPanelOpen ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
            </button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnectBoard}
              className="border-border gap-2 text-muted-foreground hover:text-foreground"
            >
              <Usb className="w-4 h-4" /> Connect
            </Button>
          )}
        </div>
      </header>

      {/* Board Connection Panel */}
      {boardPanelOpen && isConnected && (
        <div className="border-b border-border bg-[#0d1117] px-4 py-3 flex items-start gap-6 animate-in slide-in-from-top-2 duration-200">
          {/* Status */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Board Status</span>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
              </span>
              <span className="text-sm font-semibold text-green-400">Connected</span>
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={portName}>{portName}</span>
          </div>

          {/* Board type */}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Board</span>
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-medium">Arduino {board}</span>
            </div>
          </div>

          {/* Baud rate */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Baud Rate</span>
            <select
              value={baudRate}
              onChange={e => setBaudRate(e.target.value)}
              disabled={isConnected}
              className="text-sm bg-black/30 border border-border rounded px-2 py-0.5 text-foreground focus:outline-none"
            >
              {["300","1200","2400","4800","9600","19200","38400","57600","115200"].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Serial monitor mini log */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Serial Monitor</span>
            </div>
            <div className="h-12 overflow-y-auto rounded bg-black/40 border border-border/50 px-2 py-1">
              {serialLog.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">Waiting for data…</span>
              ) : (
                serialLog.slice(-4).map((line, i) => (
                  <div key={i} className="text-xs font-mono text-green-400/80 leading-4">{line}</div>
                ))
              )}
            </div>
          </div>

          {/* Disconnect */}
          <div className="flex flex-col justify-between h-full gap-2 pt-4">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDisconnectBoard}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-7 px-2"
            >
              <X className="w-3.5 h-3.5" /> Disconnect
            </Button>
          </div>
        </div>
      )}

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

        {/* Right AI Chat — ChatGPT-style */}
        <aside className="w-80 border-l border-border bg-sidebar flex flex-col flex-shrink-0">

          {/* ── RECENT CHATS VIEW ── */}
          {showRecentChats ? (
            <>
              <div className="border-b border-border bg-card flex-shrink-0 h-10 flex items-center px-3 gap-2">
                <button
                  onClick={() => setShowRecentChats(false)}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Back to chat"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="flex-1 text-sm font-bold">Recent Chats</span>
                <button
                  onClick={handleNewChat}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                  title="New chat"
                >
                  <PlusSquare className="w-3.5 h-3.5" /> New
                </button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-2 flex flex-col gap-1">
                  {(!conversations || conversations.length === 0) && (
                    <div className="text-xs text-muted-foreground text-center pt-10 flex flex-col items-center gap-2">
                      <Clock className="w-7 h-7 opacity-20" />
                      <span>No previous chats yet.</span>
                    </div>
                  )}
                  {conversations?.map((conv: any) => (
                    <button
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv.id)}
                      className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-md transition-colors group hover:bg-accent ${conv.id === conversationId ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground'}`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${conv.id === conversationId ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{conv.title || "Untitled chat"}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {conv.createdAt ? new Date(conv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            /* ── ACTIVE CHAT VIEW ── */
            <>
              {/* Chat Header */}
              <div className="border-b border-border bg-card flex-shrink-0">
                <div className="h-10 flex items-center px-3 gap-2">
                  <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                  {isEditingChatTitle ? (
                    <input
                      autoFocus
                      value={chatTitleEdit}
                      onChange={e => setChatTitleEdit(e.target.value)}
                      onBlur={handleConfirmEditTitle}
                      onKeyDown={e => { if (e.key === "Enter") handleConfirmEditTitle(); if (e.key === "Escape") setIsEditingChatTitle(false); }}
                      className="flex-1 bg-transparent border-b border-primary text-sm font-bold outline-none text-foreground"
                    />
                  ) : (
                    <span className="flex-1 text-sm font-bold truncate">
                      {chatTitleOverride || (conversationData as any)?.title || "Arduino Assistant"}
                    </span>
                  )}
                  {/* Action icons */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button title="New chat" onClick={handleNewChat} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <PlusSquare className="w-3.5 h-3.5" />
                    </button>
                    <button title="Recent chats" onClick={() => setShowRecentChats(true)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <button title="Rename chat" onClick={handleStartEditTitle} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <SquarePen className="w-3.5 h-3.5" />
                    </button>
                    <button title="Copy chat" onClick={handleCopyChat} disabled={!chatMessages.length} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                      {copiedChat ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-4">
                  {chatMessages.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center pt-8 flex flex-col items-center gap-3">
                      <MessageSquare className="w-8 h-8 opacity-20" />
                      <span>Ask anything about Arduino,<br/>attach a file, or paste code.</span>
                      {conversations && conversations.length > 0 && (
                        <button
                          onClick={() => setShowRecentChats(true)}
                          className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors mt-1"
                        >
                          <Clock className="w-3 h-3" /> View recent chats
                        </button>
                      )}
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-3 py-2 rounded-lg max-w-[90%] text-sm whitespace-pre-wrap break-words ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>
                        {msg.content || <span className="opacity-50 animate-pulse">Thinking…</span>}
                      </div>
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>
              </ScrollArea>

              <div className="border-t border-border bg-card flex-shrink-0">
                {/* Attached file badge */}
                {attachedFile && (
                  <div className="px-3 pt-2 flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded px-2 py-1 text-xs text-primary font-mono truncate">
                      <Paperclip className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{attachedFile.name}</span>
                    </div>
                    <button onClick={() => setAttachedFile(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".txt,.ino,.cpp,.c,.h,.hpp,.md,.json,.yaml,.yml" className="hidden" onChange={handleFileUpload} />
                <form onSubmit={e => { e.preventDefault(); handleSendChatMessage(); }} className="p-3 flex gap-2">
                  <button
                    type="button"
                    title="Attach file"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 p-1.5 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <Input
                    placeholder="Ask AI..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    className="bg-black/20 border-border focus-visible:ring-primary h-9"
                  />
                  <Button type="submit" size="sm" className="h-9 px-3 bg-primary text-primary-foreground flex-shrink-0">
                    Send
                  </Button>
                </form>
              </div>
            </>
          )}
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
