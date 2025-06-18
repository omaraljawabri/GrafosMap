let nodes = [];
let ways = [];
let adj = [];
let selectedNodes = [];

function convertOSM() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) {
    alert("Selecione um arquivo OSM.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(event.target.result, "application/xml");

    const nodeElements = xml.getElementsByTagName('node');
    const wayElements = xml.getElementsByTagName('way');

    nodes = [];
    ways = [];

    const idToIndex = {};
    let numID = 0;

    for (const node of nodeElements) {
      const id = node.getAttribute('id');
      const lat = parseFloat(node.getAttribute('lat'));
      const lon = parseFloat(node.getAttribute('lon'));
      const x = lon;
      const y = lat;
      idToIndex[id] = numID++;
      nodes.push({ id, x, y });
    }

    for (const way of wayElements) {
      const nds = way.getElementsByTagName('nd');
      const ndRefs = [];
      for (const nd of nds) {
        const ref = nd.getAttribute('ref');
        if (idToIndex[ref] !== undefined) {
          ndRefs.push(idToIndex[ref]);
        }
      }

      const tags = way.getElementsByTagName('tag');
      let oneway = false;
      for (const tag of tags) {
        if (tag.getAttribute('k') === 'oneway' && tag.getAttribute('v') === 'yes') {
          oneway = true;
          break;
        }
      }

      if (ndRefs.length > 1) {
        ways.push({ nodes: ndRefs, oneway });
      }
    }

    construirGrafo();
    selectedNodes = [];
    document.getElementById('result').textContent = '';
    document.getElementById('output').textContent = `Arquivo convertido e grafo criado.\nNós: ${nodes.length}\nConexões: ${numID}`;

    desenharGrafo();
  };

  reader.readAsText(file);
}

function construirGrafo() {
  adj = Array.from({ length: nodes.length }, () => []);

  for (const way of ways) {
    const ndRefs = way.nodes;
    const oneway = way.oneway;

    for (let i = 0; i < ndRefs.length - 1; i++) {
      const u = ndRefs[i];
      const v = ndRefs[i + 1];
      const weight = distancia(nodes[u], nodes[v]);

      adj[u].push({ node: v, weight });

      if (!oneway) {
        adj[v].push({ node: u, weight });
      }
    }
  }
}

function distancia(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

class PriorityQueue {
  constructor() {
    this.items = [];
  }

  enqueue(element, priority) {
    this.items.push({ element, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue() {
    return this.items.shift();
  }

  isEmpty() {
    return this.items.length === 0;
  }
}

function dijkstra(start, end) {
  const dist = Array(nodes.length).fill(Infinity);
  const prev = Array(nodes.length).fill(null);
  const visited = Array(nodes.length).fill(false);
  dist[start] = 0;

  const pq = new PriorityQueue();
  pq.enqueue(start, 0);

  while (!pq.isEmpty()) {
    const { element: u } = pq.dequeue();

    if (visited[u]) continue;
    visited[u] = true;

    if (u === end) break;

    for (const neighbor of adj[u]) {
      const alt = dist[u] + neighbor.weight;
      if (alt < dist[neighbor.node]) {
        dist[neighbor.node] = alt;
        prev[neighbor.node] = u;
        pq.enqueue(neighbor.node, alt);
      }
    }
  }

  if (dist[end] === Infinity) {
    return null;
  }

  const path = [];
  for (let at = end; at != null; at = prev[at]) {
    path.push(at);
  }
  path.reverse();

  return { distance: dist[end], path };
}

function desenharGrafo(path = []) {
  const canvas = document.getElementById('graphCanvas');
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (nodes.length === 0) return;

  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));

  const padding = 20;

  const scaleX = (canvas.width - 2 * padding) / (maxX - minX);
  const scaleY = (canvas.height - 2 * padding) / (maxY - minY);

  function scale(n) {
    return {
      x: padding + (n.x - minX) * scaleX,
      y: padding + (n.y - minY) * scaleY
    };
  }

  ctx.strokeStyle = 'gray';
  ctx.lineWidth = 1;

  for (const way of ways) {
    const ndRefs = way.nodes;
    for (let i = 0; i < ndRefs.length - 1; i++) {
      const u = scale(nodes[ndRefs[i]]);
      const v = scale(nodes[ndRefs[i + 1]]);
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);
      ctx.stroke();
    }
  }

  if (path.length > 1) {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const start = scale(nodes[path[0]]);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < path.length; i++) {
      const p = scale(nodes[path[i]]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = 'blue';
  selectedNodes.forEach(idx => {
    const p = scale(nodes[idx]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function getClosestNode(x, y) {
  const canvas = document.getElementById('graphCanvas');
  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));
  const padding = 20;

  const scaleX = (canvas.width - 2 * padding) / (maxX - minX);
  const scaleY = (canvas.height - 2 * padding) / (maxY - minY);

  function toGraphCoords(px, py) {
    const gx = (px - padding) / scaleX + minX;
    const gy = (py - padding) / scaleY + minY;
    return { x: gx, y: gy };
  }

  const clickCoord = toGraphCoords(x, y);

  let closestIndex = 0;
  let minDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = distancia(clickCoord, nodes[i]);
    if (d < minDist) {
      minDist = d;
      closestIndex = i;
    }
  }
  return closestIndex;
}

document.getElementById('graphCanvas').addEventListener('click', function(event) {
  const rect = this.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (nodes.length === 0) return;

  const closest = getClosestNode(x, y);
  selectedNodes.push(closest);

  if (selectedNodes.length > 2) {
    selectedNodes = [closest];
    document.getElementById('result').textContent = 'Novo nó de partida selecionado.';
    desenharGrafo();
    return;
  }

  if (selectedNodes.length === 2) {
    const resultado = dijkstra(selectedNodes[0], selectedNodes[1]);
    const resultDiv = document.getElementById('result');

    if (!resultado) {
      resultDiv.textContent = 'Não existe caminho entre os nós selecionados.';
      desenharGrafo();
    } else {
      resultDiv.textContent = 
        `Menor distância: ${resultado.distance.toFixed(3)}\n` +
        `Caminho: ${resultado.path.join(' -> ')}\n\n` +
        `Coordenadas do caminho:\n` + 
        resultado.path.map(i => `#${i} => (x: ${nodes[i].x.toFixed(3)}, y: ${nodes[i].y.toFixed(3)})`).join('\n');

      desenharGrafo(resultado.path);
    }
  } else {
    desenharGrafo();
  }
});