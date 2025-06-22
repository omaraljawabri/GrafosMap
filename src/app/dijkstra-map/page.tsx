"use client";

import Header from '../_components/header';
import type { NextPage } from 'next';
import { useState, ChangeEvent, useRef, useEffect, useCallback } from 'react';
import { Button } from '../_components/ui/button';
import { Input } from '../_components/ui/input';
import { Label } from '../_components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../_components/ui/card';
import { UploadCloud, Route, MapIcon, FileTextIcon, CopyIcon } from 'lucide-react';
import { useToast } from "../_hooks/use-toast";

interface ScriptNode {
  id: string;
  x: number; 
  y: number; 
}

interface AppNode extends ScriptNode {
  originalLat: number;
  originalLon: number;
}

interface Way {
  nodes: number[];
  oneway: boolean;
}

interface AdjNode {
  node: number;
  weight: number;
}
type AdjacencyList = AdjNode[][];

interface DijkstraAlgorithmResult {
  distance: number;
  distanceInMeters?: number;
  path: number[];
}

interface DijkstraDisplayResult extends DijkstraAlgorithmResult {
  visitedNodesCount: number; 
  processingTimeMs: number;
}

interface GraphType {
  isDirected: boolean;
  isWeighted: boolean;
  hasOneWayStreets: boolean;
}

interface PathError {
  type: 'NO_PATH' | 'ONE_WAY_BLOCKED' | 'DISCONNECTED_GRAPH' | 'INVALID_NODES';
  message: string;
  details?: string;
}

interface DijkstraResult {
  success: boolean;
  result?: DijkstraDisplayResult;
  error?: PathError;
}

interface ScalingParams {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scaleX: number;
  scaleY: number;
  padding: number;
  canvasWidth: number;
  canvasHeight: number;
}

class MinHeap {
  heap: { node: number; priority: number }[];

  constructor() {
    this.heap = [];
  }

  private parent(i: number) {
    return Math.floor((i - 1) / 2);
  }

  private left(i: number) {
    return 2 * i + 1;
  }

  private right(i: number) {
    return 2 * i + 2;
  }

  private swap(i: number, j: number) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  private heapifyUp(index: number) {
    while (index > 0 && this.heap[this.parent(index)].priority > this.heap[index].priority) {
      this.swap(index, this.parent(index));
      index = this.parent(index);
    }
  }

  private heapifyDown(index: number) {
    let smallest = index;
    const left = this.left(index);
    const right = this.right(index);

    if (left < this.heap.length && this.heap[left].priority < this.heap[smallest].priority) {
      smallest = left;
    }

    if (right < this.heap.length && this.heap[right].priority < this.heap[smallest].priority) {
      smallest = right;
    }

    if (smallest !== index) {
      this.swap(index, smallest);
      this.heapifyDown(smallest);
    }
  }

  insert(node: number, priority: number) {
    this.heap.push({ node, priority });
    this.heapifyUp(this.heap.length - 1);
  }

  extractMin(): { node: number; priority: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0 && end) {
      this.heap[0] = end;
      this.heapifyDown(0);
    }
    return min;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }
}

const DijkstraMapPage: NextPage = () => {
  const [osmFile, setOsmFile] = useState<File | null>(null);
  const [polyFile, setPolyFile] = useState<File | null>(null);
  const [appNodes, setAppNodes] = useState<AppNode[]>([]);
  const [scriptNodes, setScriptNodes] = useState<ScriptNode[]>([]);
  const [ways, setWays] = useState<Way[]>([]);
  const [adj, setAdj] = useState<AdjacencyList>([]);
  const [selectedNodeIndices, setSelectedNodeIndices] = useState<number[]>([]);
  const [pathResult, setPathResult] = useState<DijkstraDisplayResult | null>(null);
  const [pathResultText, setPathResultText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [mapStats, setMapStats] = useState<string | null>(null);
  const [scalingParams, setScalingParams] = useState<ScalingParams | null>(null);
  const [dashOffset, setDashOffset] = useState(0);
  const [graphType, setGraphType] = useState<GraphType>({
    isDirected: false,
    isWeighted: true,
    hasOneWayStreets: false
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const { toast } = useToast();

  const distancia = useCallback((a: ScriptNode, b: ScriptNode): number => {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }, []);

  const buildGraphInternal = useCallback((currentNodes: ScriptNode[], currentWays: Way[]) => {
    const newAdj: AdjacencyList = Array.from({ length: currentNodes.length }, () => []);
    let hasOneWayStreets = false;
    let isDirected = false;
    
    for (const way of currentWays) {
      const ndRefs = way.nodes;
      for (let i = 0; i < ndRefs.length - 1; i++) {
        const uIndex = ndRefs[i];
        const vIndex = ndRefs[i + 1];
        if (uIndex === undefined || vIndex === undefined || uIndex >= currentNodes.length || vIndex >= currentNodes.length) continue;
        const weight = distancia(currentNodes[uIndex], currentNodes[vIndex]);
        newAdj[uIndex].push({ node: vIndex, weight });
        if (!way.oneway) {
          newAdj[vIndex].push({ node: uIndex, weight });
        } else {
          hasOneWayStreets = true;
          isDirected = true;
        }
      }
    }
    
    setGraphType({
      isDirected,
      isWeighted: true,
      hasOneWayStreets
    });
    
    setAdj(newAdj);
    
  }, [distancia]);

const handleFileUploadAndParse = useCallback(async () => {
  if (!osmFile) {
    setTimeout(() => toast({
      title: "Nenhum Arquivo",
      description: "Por favor, selecione um arquivo .osm primeiro.",
      variant: "destructive"
    }), 0);
    return;
  }

  setIsLoading(true);
  setPathResultText(null); setPathResult(null); setSelectedNodeIndices([]);
  setAppNodes([]); setScriptNodes([]); setWays([]); setAdj([]); setMapStats(null); setScalingParams(null);

  const geoToMeters = (lat: number, lon: number): { x: number; y: number } => {
    const R = 6378137; // Raio da Terra (WGS84)
    const x = R * lon * Math.PI / 180;
    const y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    return { x, y };
  };

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(event.target?.result as string, "application/xml");
      if (xmlDoc.querySelector('parsererror')) {
        setTimeout(() => toast({
          title: "Erro de Parsing",
          description: "Não foi possível parsear o arquivo OSM.",
          variant: "destructive"
        }), 0);
        setIsLoading(false); return;
      }

      const nodeElements = Array.from(xmlDoc.getElementsByTagName('node'));
      const wayElements = Array.from(xmlDoc.getElementsByTagName('way'));

      const newParsedAppNodes: AppNode[] = [];
      const newParsedScriptNodes: ScriptNode[] = [];
      const idToIndex: { [id: string]: number } = {};
      let numID = 0;

      const originalCoords: { x: number; y: number }[] = [];

      nodeElements.forEach(nodeEl => {
        const id = nodeEl.getAttribute('id');
        const lat = parseFloat(nodeEl.getAttribute('lat') || '0');
        const lon = parseFloat(nodeEl.getAttribute('lon') || '0');
        if (id) {
          const { x, y } = geoToMeters(lat, lon);
          originalCoords.push({ x, y });
          idToIndex[id] = numID++;
          newParsedAppNodes.push({ id, x: 0, y: 0, originalLat: lat, originalLon: lon });
          newParsedScriptNodes.push({ id, x: 0, y: 0 });
        }
      });

      // Escala e inversão vertical
      const xs = originalCoords.map(c => c.x);
      const ys = originalCoords.map(c => c.y);
      const minX = Math.min(...xs);
      const maxY = Math.max(...ys);
      const escala = 2; // 1 pixel = 2 metros

      for (let i = 0; i < originalCoords.length; i++) {
        const scaledX = (xs[i] - minX) / escala;
        const scaledY = (maxY - ys[i]) / escala; // inverte o eixo Y

        newParsedAppNodes[i].x = scaledX;
        newParsedAppNodes[i].y = scaledY;
        newParsedScriptNodes[i].x = scaledX;
        newParsedScriptNodes[i].y = scaledY;
      }

      const newParsedWays: Way[] = [];
      wayElements.forEach(wayEl => {
        const nds = Array.from(wayEl.getElementsByTagName('nd'));
        const ndRefs: number[] = nds.map(nd => idToIndex[nd.getAttribute('ref')!]).filter(ref => ref !== undefined);

        const oneway = Array.from(wayEl.getElementsByTagName('tag')).some(
          tag => tag.getAttribute('k') === 'oneway' && tag.getAttribute('v') === 'yes'
        );

        if (ndRefs.length > 1) {
          newParsedWays.push({ nodes: ndRefs, oneway }); // ⬅️ mantém direção
        }
      });

      setAppNodes(newParsedAppNodes);
      setScriptNodes(newParsedScriptNodes);
      setWays(newParsedWays);
      buildGraphInternal(newParsedScriptNodes, newParsedWays);

      // Contagem correta de arestas, levando em conta mão única
      const totalEdges = newParsedWays.reduce((sum, way) => {
        const segments = way.nodes.length - 1;
        return sum + (way.oneway ? segments : segments * 2);
      }, 0);

      setMapStats(`Arquivo .osm convertido e grafo criado.\nNós: ${newParsedScriptNodes.length}\nArestas: ${totalEdges}`);

      setTimeout(() => toast({
        title: "Arquivo .osm processado",
        description: "Grafo gerado com sucesso a partir do arquivo OSM."
      }), 0);
    } catch (error) {
      setTimeout(() => toast({
        title: "Erro de Processamento",
        description: "Ocorreu um erro ao processar o arquivo OSM. Tente novamente.",
        variant: "destructive"
      }), 0);
      setAppNodes([]); setScriptNodes([]); setWays([]); setAdj([]); setSelectedNodeIndices([]); setMapStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  reader.onerror = () => {
    setTimeout(() => toast({
      title: "Erro de Leitura de Arquivo",
      description: "Selecione um arquivo .osm válido.",
      variant: "destructive"
    }), 0);
    setIsLoading(false);
  };

  reader.readAsText(osmFile);
}, [osmFile, toast, buildGraphInternal]);



  const handlePolyFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.poly')) {
      setPolyFile(file);
      setAppNodes([]); setScriptNodes([]); setWays([]); setAdj([]); setSelectedNodeIndices([]);
      setPathResult(null); setPathResultText(null); setMapStats("Carregando novo arquivo...");
      setScalingParams(null);
      canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    } else {
      toast({ title: "Erro de Leitura de Arquivo", description: "Selecione um arquivo .poly válido.", variant: "destructive" });
      setPolyFile(null);
    }
  };

  const handlePolyUploadAndParse = useCallback(() => {
  if (!polyFile) {
    toast({ title: "Nenhum Arquivo", description: "Por favor, selecione um arquivo .poly.", variant: "destructive" });
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result as string;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      if (lines.length < 2) throw new Error("Arquivo inválido");

      // === PARTE 1: VÉRTICES ===
      const [nNodesStr] = lines[0].split(/\s+/);
      const nNodes = parseInt(nNodesStr);
      const nodeLines = lines.slice(1, 1 + nNodes);

      const nodes: AppNode[] = nodeLines.map(line => {
        const [idStr, xStr, yStr] = line.split(/\s+/);
        return {
          id: idStr,
          x: parseFloat(xStr),
          y: parseFloat(yStr),
          originalLat: parseFloat(yStr),
          originalLon: parseFloat(xStr),
        };
      });

      // === PARTE 2: ARESTAS ===
      const edgesHeaderLine = lines[1 + nNodes]; // linha do tipo "109 0 1"
      const nEdges = parseInt(edgesHeaderLine.split(/\s+/)[0]); // pode ser usado para validar

      const edgeLines = lines.slice(2 + nNodes, lines.length - 1); // ignora o último "0"

      const newParsedWays: Way[] = [];

      edgeLines.forEach(line => {
        const [_, fromStr, toStr] = line.split(/\s+/);
        const from = parseInt(fromStr);
        const to = parseInt(toStr);
        newParsedWays.push({ nodes: [from, to], oneway: false }); // uma aresta por linha
      });

      const script: ScriptNode[] = nodes.map(({ id, x, y }) => ({ id, x, y }));

      setAppNodes(nodes);
      setScriptNodes(script);
      setWays(newParsedWays);
      buildGraphInternal(script, newParsedWays);
      setMapStats(`Arquivo .poly convertido e grafo criado.\nNós: ${script.length}\nArestas: ${newParsedWays.length}`);
      toast({ title: "Arquivo .poly processado", description: "Grafo gerado com sucesso a partir do arquivo POLY." });
    } catch (e) {
      console.error(e);
      toast({ title: "Erro", description: "Falha ao processar arquivo .poly personalizado.", variant: "destructive" });
    }
  };

  reader.onerror = () => {
    toast({ title: "Erro de Processamento", description: "Ocorreu um erro ao processar o arquivo POLY. Tente novamente.", variant: "destructive" });
  };

  reader.readAsText(polyFile);
}, [polyFile, toast, buildGraphInternal]);


  const dijkstraInternal = useCallback((startNodeIndex: number, endNodeIndex: number, currentNodes: ScriptNode[], currentAdj: AdjacencyList): DijkstraResult => {
  if (currentNodes.length === 0 || currentAdj.length === 0 || startNodeIndex >= currentNodes.length || endNodeIndex >= currentNodes.length) {
    return {
      success: false,
      error: {
        type: 'INVALID_NODES',
        message: 'Nós inválidos ou grafo vazio',
        details: 'Verifique se o grafo foi carregado corretamente e se os nós selecionados são válidos.'
      }
    };
  }

  const startTime = performance.now();
  const dist = Array(currentNodes.length).fill(Infinity);
  const prev = Array(currentNodes.length).fill(null);
  const visited = Array(currentNodes.length).fill(false);
  let visitedNodesCount = 0;

  dist[startNodeIndex] = 0;
  const pq = new MinHeap();
  pq.insert(startNodeIndex, 0);

  while (!pq.isEmpty()) {
    const current = pq.extractMin();
    if (!current) break;
    const u = current.node;

    if (visited[u]) continue;
    visited[u] = true;
    visitedNodesCount++;

    if (u === endNodeIndex) break;

    for (const neighbor of currentAdj[u]) {
      const alt = dist[u] + neighbor.weight;
      if (alt < dist[neighbor.node]) {
        dist[neighbor.node] = alt;
        prev[neighbor.node] = u;
        pq.insert(neighbor.node, alt);
      }
    }
  }

  const processingTimeMs = performance.now() - startTime;

  if (dist[endNodeIndex] === Infinity) {
    const hasOneWayIssue = graphType.hasOneWayStreets && 
      (currentAdj[startNodeIndex].length === 0 || 
        !currentAdj.some(neighbors => neighbors.some(n => n.node === endNodeIndex)));

    return {
      success: false,
      error: {
        type: hasOneWayIssue ? 'ONE_WAY_BLOCKED' : 'NO_PATH',
        message: hasOneWayIssue ? 
          'Caminho bloqueado por vias com mão única' : 
          'Não existe caminho entre os nós selecionados',
        details: hasOneWayIssue ?
          'O caminho não pode ser encontrado devido a direção nas vias. Tente selecionar nós diferentes.' :
          'Os nós selecionados não estão conectados no grafo.'
      }
    };
  }

  const path: number[] = [];
  for (let at: number | null = endNodeIndex; at !== null; at = prev[at]) path.push(at);
  path.reverse();

  const distanceInPixels = dist[endNodeIndex];
  const escalaEmMetros = 2; // ajuste conforme necessário
  const distanceInMeters = distanceInPixels * escalaEmMetros;

  return {
    success: true,
    result: { 
      distance: distanceInPixels,
      distanceInMeters, // <-- novo campo retornado
      path,
      visitedNodesCount,
      processingTimeMs
    }
  };
}, [graphType.hasOneWayStreets]);



  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scriptNodes.length === 0) {
      setScalingParams(null);
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const padding = 20; const canvasWidth = canvas.width; const canvasHeight = canvas.height;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    if (scriptNodes.length > 0) {
      minX = Math.min(...scriptNodes.map(n => n.x)); maxX = Math.max(...scriptNodes.map(n => n.x));
      minY = Math.min(...scriptNodes.map(n => n.y)); maxY = Math.max(...scriptNodes.map(n => n.y));
    } else { minX = 0; maxX = 1; minY = 0; maxY = 1; }
    
    const dX = maxX - minX; 
    const dY = maxY - minY;

    const scaleX = (dX === 0) ? 1 : (canvasWidth - 2 * padding) / dX;
    const scaleY = (dY === 0) ? 1 : (canvasHeight - 2 * padding) / dY;
    
    setScalingParams({ 
        minX, maxX, minY, maxY, scaleX, scaleY, 
        padding, canvasWidth, canvasHeight 
    });
  }, [scriptNodes, osmFile]);
  
  const scaleCanvasPoint = useCallback((node: ScriptNode): { x: number, y: number } => {
    if (!scalingParams) return { x: 0, y: 0 };
    if (scalingParams.maxX === scalingParams.minX && scalingParams.maxY === scalingParams.minY) {
        return { x: scalingParams.canvasWidth / 2, y: scalingParams.canvasHeight / 2 };
    }
    return {
      x: scalingParams.padding + (node.x - scalingParams.minX) * scalingParams.scaleX,
      y: scalingParams.padding + (node.y - scalingParams.minY) * scalingParams.scaleY
    };
  }, [scalingParams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scalingParams || scriptNodes.length === 0 ) {
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 1;
    ctx.lineWidth = 1;
    ways.forEach(way => {
      for (let i = 0; i < way.nodes.length - 1; i++) {
        const fromIdx = way.nodes[i];
        const toIdx = way.nodes[i + 1];

        const from = scriptNodes[fromIdx];
        const to = scriptNodes[toIdx];
        if (!from || !to) continue;

        const u = scaleCanvasPoint(from);
        const v = scaleCanvasPoint(to);

        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);

        if (way.oneway) {
          ctx.strokeStyle = '#f59e0b'; 
        } else {
          ctx.strokeStyle = '#94a3b8'; 
        }

        ctx.stroke();
      }
    });


    if (pathResult?.path.length) {
      ctx.strokeStyle = 'red'; 
      ctx.lineWidth = 3;
      ctx.shadowColor = 'red'; 
      ctx.shadowBlur = 8;
      ctx.setLineDash([10, 5]); ctx.lineDashOffset = -dashOffset;
      ctx.beginPath();
      if (scriptNodes[pathResult.path[0]]) {
        const startPathNode = scaleCanvasPoint(scriptNodes[pathResult.path[0]]);
        ctx.moveTo(startPathNode.x, startPathNode.y);
        for (let i = 1; i < pathResult.path.length; i++) {
          if (scriptNodes[pathResult.path[i]]) {
            ctx.lineTo(scaleCanvasPoint(scriptNodes[pathResult.path[i]]).x, scaleCanvasPoint(scriptNodes[pathResult.path[i]]).y);
          }
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.setLineDash([]);
    }
    
    ctx.fillStyle = 'green'; 
    selectedNodeIndices.forEach(nodeIndex => {
      if (scriptNodes[nodeIndex]) {
        const p = scaleCanvasPoint(scriptNodes[nodeIndex]);
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI); ctx.fill();
        
        const appNode = appNodes[nodeIndex];
        if (appNode) {
            ctx.fillStyle = document.documentElement.classList.contains('dark') ? 'blue' : 'blue';
            ctx.font = "10px Arial";
            ctx.textAlign = "center"; ctx.fillText(`ID: ${appNode.id}`, p.x, p.y - 10);
        }
      }
    });
  }, [scriptNodes, ways, pathResult, selectedNodeIndices, scalingParams, scaleCanvasPoint, dashOffset, appNodes]);

  useEffect(() => {
    if (pathResult?.path.length) {
      const animate = () => {
        setDashOffset(prevOffset => (prevOffset + 0.5) % 15);
        animationFrameIdRef.current = requestAnimationFrame(animate);
      };
      animationFrameIdRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null; setDashOffset(0);
    }
    return () => { if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current); };
  }, [pathResult]);

  const getClosestNodeIndex = useCallback((canvasX: number, canvasY: number): number | null => {
    if (!scalingParams || scriptNodes.length === 0 || !canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    
    const internalX = canvasX / scaleX;
    const internalY = canvasY / scaleY;
    
    const graphX = (internalX - scalingParams.padding) / scalingParams.scaleX + scalingParams.minX;
    const graphY = (internalY - scalingParams.padding) / scalingParams.scaleY + scalingParams.minY;

    let closestIndex = -1; 
    let minSqDist = Infinity;
    
    for (let i = 0; i < scriptNodes.length; i++) {
      const dx = graphX - scriptNodes[i].x; 
      const dy = graphY - scriptNodes[i].y;
      const sqDist = dx * dx + dy * dy;
      if (sqDist < minSqDist) { 
        minSqDist = sqDist; 
        closestIndex = i;
      }
    }
    
    const scaleFactor = Math.min(scaleX, scaleY);
    const threshold = Math.max(15 / scaleFactor, 8);
    const distanceInPixels = Math.sqrt(minSqDist) * Math.min(Math.abs(scalingParams.scaleX), Math.abs(scalingParams.scaleY)) * scaleFactor;
    
    return (closestIndex !== -1 && distanceInPixels < threshold * 1.5) ? closestIndex : null;

  }, [scriptNodes, scalingParams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scriptNodes.length === 0 || !scalingParams || isLoading) return;

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
     const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      const closestNodeIdx = getClosestNodeIndex(x, y);

      if (closestNodeIdx === null) return;

      const newSelectedIndices = [...selectedNodeIndices];
      const existingIdxInSelection = newSelectedIndices.indexOf(closestNodeIdx);

      if (existingIdxInSelection !== -1) {
        newSelectedIndices.splice(existingIdxInSelection, 1);
        setTimeout(() => toast({ title: "Nó Desselecionado", description: `Nó ${appNodes[closestNodeIdx]?.id} removido.` }), 0);
      } else {
        newSelectedIndices.push(closestNodeIdx);
      }
      
      setPathResult(null); 
      setPathResultText(null);

      if (newSelectedIndices.length > 2) {
        setSelectedNodeIndices([closestNodeIdx]);
         setTimeout(() => toast({ title: "Novo Nó de Partida", description: `Nó ${appNodes[closestNodeIdx]?.id} selecionado como partida. Selecione o destino.`}),0);
      } else {
        setSelectedNodeIndices(newSelectedIndices);
        if (newSelectedIndices.length === 1) {
           setTimeout(() => toast({ title: "Nó de Início Selecionado", description: `Nó ${appNodes[newSelectedIndices[0]]?.id}. Selecione o destino.` }), 0);
        }
      }

      if (newSelectedIndices.length === 2) {
        const startNodeIdx = newSelectedIndices[0]; const endNodeIdx = newSelectedIndices[1];
        const result = dijkstraInternal(startNodeIdx, endNodeIdx, scriptNodes, adj);
        
        if (!result.success) {
          const errorMessage = result.error?.type === 'ONE_WAY_BLOCKED' ? 
            'Caminho bloqueado por vias com mão única' : 
            'Caminho não encontrado';
          
          setTimeout(() => toast({ 
            variant: "destructive", 
            title: errorMessage,
            description: result.error?.details || 'Tente selecionar nós diferentes.'
          }), 0);
          
          setPathResultText(result.error?.message || 'Não existe caminho entre os nós selecionados.');
            } else {
              const pathNodeIds = result.result!.path.map(idx => scriptNodes[idx].id).join(' -> ');
              const pathNodeCoords = result.result!.path.map(i => `Nó ${scriptNodes[i].id} (Lon: ${appNodes[i].originalLon.toFixed(5)}, Lat: ${appNodes[i].originalLat.toFixed(5)})`).join('\n');

            // Cálculo adicional
              const escalaEmMetros = 2; // ajuste se necessário
              const distanceInMeters = result.result!.distance * escalaEmMetros;

              const resultString = 
              `Menor Caminho:\nOrigem: Nó ${scriptNodes[startNodeIdx].id} (Lat: ${appNodes[startNodeIdx].originalLat.toFixed(5)}, Lon: ${appNodes[startNodeIdx].originalLon.toFixed(5)})\n` +
                `Destino: Nó ${scriptNodes[endNodeIdx].id} (Lat: ${appNodes[endNodeIdx].originalLat.toFixed(5)}, Lon: ${appNodes[endNodeIdx].originalLon.toFixed(5)})\n` +
                `---------------------------------\nDistância: ${result.result!.distance.toFixed(3)} px (${distanceInMeters.toFixed(2)} m)\n` +
    `Tempo de processamento: ${result.result!.processingTimeMs.toFixed(2)} ms\n` +
    `Nós visitados: ${result.result!.visitedNodesCount}\n---------------------------------\nCaminho (IDs):\n${pathNodeIds}\n` +
    `---------------------------------\nCoordenadas:\n${pathNodeCoords}`;

  setPathResultText(resultString);
  setPathResult(result.result || null);
  setTimeout(() => toast({
    title: "Caminho Encontrado!",
    description: `Distância: ${result.result!.distance.toFixed(3)}.`,
  }), 0);
}

      }
    };
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [canvasRef, scriptNodes, adj, scalingParams, getClosestNodeIndex, dijkstraInternal, toast, isLoading, selectedNodeIndices, appNodes]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      const file = event.target.files[0];
      if (file.name.endsWith('.osm')) {
        setOsmFile(file); 
        setAppNodes([]); setScriptNodes([]); setWays([]); setAdj([]); setSelectedNodeIndices([]);
        setPathResult(null); setPathResultText(null); setMapStats("Carregando novo arquivo...");
        setScalingParams(null);
        if(canvasRef.current) canvasRef.current.getContext('2d')?.clearRect(0,0,canvasRef.current.width, canvasRef.current.height);
      } else {
        setTimeout(() => toast({ title: "Erro de Arquivo", description: "Selecione um arquivo .osm válido.", variant: "destructive" }), 0);
        if (event.target) event.target.value = ''; setOsmFile(null);
      }
    } else { setOsmFile(null); }
  };

  const handleCopyImage = useCallback(async () => {
    if (!canvasRef.current) {
      setTimeout(() => toast({ title: "Erro", description: "Canvas não encontrado.", variant: "destructive" }), 0); return;
    }
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setTimeout(() => toast({ title: "Sucesso!", description: "Imagem copiada." }), 0);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      setTimeout(() => toast({ title: "Erro ao Copiar", variant: "destructive" }), 0);
    }
  }, [toast]);

  return (
  <>
    <Header />

    <div className="container mx-auto py-8 px-4 flex flex-col items-center min-h-[calc(100vh-8rem)] pt-1">
      <Card className="w-full max-w-7xl mb-8 bg-card/80 backdrop-blur-md shadow-xl border-border/50">
        <CardHeader className="text-center">
          <MapIcon className="mx-auto h-12 w-12 text-primary mb-2" />
          <CardTitle className="text-3xl font-headline text-primary">Mapa Interativo com Dijkstra</CardTitle>
          <CardDescription className="text-muted-foreground">
            Carregue um arquivo .OSM ou .POLY, clique nos nós para definir uma origem (verde) e um destino (azul) e visualize o menor caminho.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Label htmlFor="osm-file" className="text-lg font-medium text-foreground">Arquivo .OSM</Label>
            <div className="flex flex-col sm:flex-row gap-4 items-stretch">
              <Input
                id="osm-file" ref={fileInputRef} type="file" accept=".osm" onChange={handleFileChange}
                className="flex-grow file:mr-4 file:py-2 h-14 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <Button onClick={handleFileUploadAndParse} disabled={!osmFile || isLoading} className="w-full sm:w-auto h-14">
                <UploadCloud className="mr-2 h-5 w-5" />
                {isLoading ? 'Processando...' : 'Carregar e Processar OSM'}
              </Button>
            </div>
            {osmFile && <p className="text-sm text-muted-foreground">Arquivo: {osmFile.name}</p>}
          </div>

          <div className="space-y-4 pt-4 border-t border-border/50 mt-6">
            <Label htmlFor="poly-file" className="text-lg font-medium text-foreground">Arquivo .POLY</Label>
            <div className="flex flex-col sm:flex-row gap-4 items-stretch">
              <Input
                id="poly-file" type="file" accept=".poly" onChange={handlePolyFileChange}
                className="flex-grow file:mr-4 file:py-2 h-14 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <Button onClick={handlePolyUploadAndParse} disabled={!polyFile || isLoading} className="w-full sm:w-auto h-14">
                <UploadCloud className="mr-2 h-5 w-5" />
                {isLoading ? 'Processando...' : 'Carregar e Processar POLY'}
              </Button>
            </div>
            {polyFile && <p className="text-sm text-muted-foreground">Arquivo: {polyFile.name}</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-7xl bg-card/80 backdrop-blur-md shadow-xl border-border/50">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl font-headline text-primary flex items-center">
                <Route className="mr-2 h-6 w-6" /> Visualização do Grafo
              </CardTitle>
              {mapStats && (
                <CardDescription className="text-muted-foreground pt-1 whitespace-pre-line">
                  {mapStats}
                </CardDescription>
              )}
            </div>
            {appNodes.length > 0 && (
              <Button onClick={handleCopyImage} variant="outline" size="sm" className="ml-auto">
                <CopyIcon className="mr-2 h-4 w-4" /> Copiar Imagem
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-7xl overflow-auto">
            <canvas
              ref={canvasRef}
              width={1400}
              height={900}
              className="border border-border/60 rounded-md bg-background/30 shadow-inner w-full h-auto"
            />
          </div>
          {appNodes.length === 0 && !isLoading && (
            <p className="mt-4 text-muted-foreground">
              Carregue um arquivo OSM ou POLY para visualizar o grafo.
            </p>
          )}
          {isLoading && (
            <p className="mt-4 text-muted-foreground">Processando arquivo, aguarde...</p>
          )}

          {selectedNodeIndices.length > 0 && appNodes.length > 0 && (
            <div className="mt-4 w-full text-sm text-muted-foreground space-y-2">
              {selectedNodeIndices.map((nodeIndex, displayIndex) => {
                const node = appNodes[nodeIndex];
                if (!node) return null;
                return (
                  <p key={nodeIndex}>
                    <strong className="text-foreground">
                      {displayIndex === 0 ? 'Origem:' : 'Destino:'}
                    </strong>{' '}
                    Nó {node.id} (Lat: {node.originalLat.toFixed(5)}, Lon:{' '}
                    {node.originalLon.toFixed(5)})
                  </p>
                );
              })}
            </div>
          )}

          {/* Legenda */}
          {appNodes.length > 0 && (
            <div className="mt-4 w-full text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Legenda:</p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-0.5 bg-[#94a3b8]"></div>
                  <span>Mão dupla</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-0.5 bg-[#f59e0b]"></div>
                  <span>Mão única</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-2 bg-red-500 rounded-full"></div>
                  <span>Caminho encontrado</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>Nó de origem</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Nó de destino</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pathResultText && (
        <Card className="w-full max-w-7xl mt-8 bg-card/80 backdrop-blur-md shadow-xl border-border/50">
          <CardHeader>
            <CardTitle className="text-xl font-headline text-primary flex items-center">
              <FileTextIcon className="mr-2 h-6 w-6" /> Resultado do Caminho
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <pre className="text-sm text-foreground whitespace-pre-wrap bg-background/50 p- rounded-md">
              {pathResultText}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  </>
);
}

export default DijkstraMapPage;
