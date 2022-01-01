// Copyright (c) 2021 LMU Munich Geometry Processing Authors. All rights reserved.
// Created by Changkun Ou <https://changkun.de>.
//
// Use of this source code is governed by a GNU GPLv3 license that can be found
// in the LICENSE file.

import {Vertex, Edge, Face, Halfedge} from './primitive';
import {Vector} from '../linalg/vec';
import {Matrix} from '../linalg/mat';
import {Quaternion} from '../linalg/quaternion';

export class HalfedgeMesh {
  // context is a transformation context (model matrix) that accumulates
  // applied transformation matrices (multiplied from the left side) for
  // the given mesh.
  //
  // context is a persistent status for the given mesh and can be reused
  // for each of the rendering frames unless the mesh intentionally
  // calls the resetContext() method.
  context: Matrix;
  color: Vector;
  wireframe: Vector;

  // The following four fields are the key fields to represent half-edge based
  // meshes.
  verts: Vertex[]; // a list of vertices
  edges: Edge[]; // a list of edges
  faces: Face[]; // a list of faces
  halfedges: Halfedge[]; // a list of halfedges

  /**
   * constructor constructs the halfedge-based mesh representation.
   *
   * @param {string} data is a text string from an .obj file
   */
  constructor(data: string) {
    // context is initialized as an identity matrix.
    // prettier-ignore
    this.context = new Matrix(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    );
    this.color = new Vector(0, 128, 255, 1);
    this.wireframe = new Vector(125, 125, 125, 1);

    // load .obj file
    const indices: number[] = [];
    const positions: Vector[] = [];
    const lines = data.split('\n');
    for (let line of lines) {
      line = line.trim();
      const tokens = line.split(' ');
      switch (tokens[0].trim()) {
        case 'v':
          positions.push(
            new Vector(
              parseFloat(tokens[1]),
              parseFloat(tokens[2]),
              parseFloat(tokens[3]),
              1
            )
          );
          break;
        case 'f':
          // only load indices of vertices
          for (let i = 1; i < tokens.length; i++) {
            const vv = tokens[i].split('/');
            indices.push(parseInt(vv[0]) - 1);
          }
          break;
      }
    }

    this.verts = []; // an array of Vertex object
    this.edges = []; // an array of Edge object
    this.faces = []; // an array of Face object
    this.halfedges = []; // an array of Halfedge object
    const t0 = performance.now();
    this.buildMesh(indices, positions);
    const t1 = performance.now();
    console.log("time: " + (t1 - t0))
  }

  /**
   * buildMesh builds half-edge based connectivity for the given vertex index buffer
   * and vertex position buffer.
   *
   * @param indices is the vertex index buffer that contains all vertex indices.
   * @param positions is the vertex buffer that contains all vertex positions.
   */
  buildMesh(indices: number[], positions: Vector[]) {
    this.verts = new Array(positions.length);
    this.faces = new Array(indices.length / 3);

    // create all vertices at once
    for (let i = 0; i < positions.length; i++) {
      const vert = new Vertex(positions[i]);
      vert.idx = i;
      this.verts[i] = vert;
    }

    const orderIds = (a: number, b: number) => {
      if (a < b) {
        return {a: b, b: a};
      }
      return {a, b};
    };

    const getOrderedIdKey = (a: number, b: number) => {
      const ordered = orderIds(a, b);
      return ordered.a + '-' + ordered.b;
    };

    // find all unique edges
    const edges = new Map<
      string,
      {
        vertA: number;
        vertB: number;
        created: boolean;
        halfA: number;
        halfB: number;
      }
    >();
    for (let i = 0; i < indices.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const a = indices[i + j];
        const b = indices[i + ((j + 1) % 3)];
        const key = getOrderedIdKey(a, b);
        if (!edges.has(key)) {
          // store the edge
          const orderedIds = orderIds(a, b);
          edges.set(key, {
            vertA: orderedIds.a,
            vertB: orderedIds.b,
            created: false,
            halfA: -1,
            halfB: -1,
          });
        }
      }
    }

    this.edges = new Array(edges.size);
    this.halfedges = new Array(edges.size * 2);
    let nextEdgeID = 0;

    // create faces, edges and halfedges
    for (let i = 0; i < indices.length; i += 3) {
      const f = new Face();
      f.idx = i / 3;
      this.faces[i / 3] = f;

      for (let j = 0; j < 3; j++) {
        const a = indices[i + j];
        const b = indices[i + ((j + 1) % 3)];
        const key = getOrderedIdKey(a, b);
        const edge = edges.get(key);
        if (edge) {
          if (!edge.created) {
            const e = new Edge();
            e.idx = nextEdgeID;
            const he1 = new Halfedge();
            he1.edge = e;
            he1.vert = this.verts[edge.vertA];
            he1.onBoundary = true;
            const he1ID = nextEdgeID * 2;
            he1.idx = he1ID;
            const he2 = new Halfedge();
            he2.edge = e;
            he2.vert = this.verts[edge.vertB];
            he2.onBoundary = true;
            const he2ID = nextEdgeID * 2 + 1;
            he2.idx = he2ID;
            he1.twin = he2;
            he2.twin = he1;
            this.verts[a].halfedge = he1;
            this.verts[b].halfedge = he2;
            if (a === edge.vertB) {
              this.verts[a].halfedge = he2;
              this.verts[b].halfedge = he1;
            }
            e.halfedge = he1;
            /* if (a === edge.a) {
              he1.onBoundary = false;
              he2.onBoundary = true;
            } else {
              he2.onBoundary = false;
              he1.onBoundary = true;
            } */
            this.edges[nextEdgeID] = e;
            this.halfedges[he1ID] = he1;
            this.halfedges[he2ID] = he2;
            nextEdgeID++;
            edge.created = true;
            edge.halfA = he1.idx as number;
            edge.halfB = he2.idx as number;
          }
          let faceHalfedgeID = edge.halfA;
          if (a === edge.vertB) {
            faceHalfedgeID = edge.halfB;
          }
          const he = this.halfedges[faceHalfedgeID];
          // assign first halfedge to face
          if (j === 0) {
            f.halfedge = he;
          }
          he.onBoundary = false;
        } else {
          throw new Error('Edge could not be found in edge map');
        }
      }

      // link prev and next halfedge circles
      for (let j = 0; j < 3; j++) {
        const a = indices[i + j];
        const b = indices[i + ((j + 1) % 3)];
        const key = getOrderedIdKey(a, b);
        const edge = edges.get(key);
        if (edge) {
          let faceHalfedgeID = edge.halfA;
          if (a === edge.vertB) {
            faceHalfedgeID = edge.halfB;
          }
          const he = this.halfedges[faceHalfedgeID];
          he.face = f;
          // next linking
          const nextKey = getOrderedIdKey(
            indices[i + ((j + 1) % 3)],
            indices[i + ((j + 2) % 3)]
          );
          const nextEdge = edges.get(nextKey);
          he.next = this.halfedges[nextEdge!.halfA];
          if (indices[i + ((j + 1) % 3)] === nextEdge!.vertB) {
            he.next = this.halfedges[nextEdge!.halfB];
          }
          // prev linking
          const prevKey = getOrderedIdKey(
            indices[i + ((j + 2) % 3)],
            indices[i + ((j + 3) % 3)]
          );
          const prevEdge = edges.get(prevKey);
          he.prev = this.halfedges[prevEdge!.halfA];
          if (indices[i + ((j + 2) % 3)] === prevEdge!.vertB) {
            he.prev = this.halfedges[prevEdge!.halfB];
          }
        } else {
          throw new Error('Edge could not be found in edge map');
        }
      }
    }
    // finally create halfedge loops for boundaries
    // first get all halfedges that are at a boundary
    const noNextBoundaryHalfedge = new Map<number, Halfedge>();
    const boundaryHalfedges = new Map<number, Halfedge>();
    for (let i = 0; i < this.halfedges.length; i++) {
      const he = this.halfedges[i];
      if (he.onBoundary) {
        const key = he.vert!.idx;
        boundaryHalfedges.set(key as number, he); // TODO: what if maybe two boundary edges on one vert!?
        noNextBoundaryHalfedge.set(key as number, he);
      }
    }
    // now find neighbors
    while (noNextBoundaryHalfedge.size > 0) {
      
      const values = noNextBoundaryHalfedge.entries().next().value;
      const key = values[0] as number;
      const he = values[1] as Halfedge;
      const nextVert = he.twin!.vert!;
      if (boundaryHalfedges.has(nextVert.idx as number)) {
        const nextHE = boundaryHalfedges.get(nextVert.idx as number)!;
        he.next = nextHE;
        nextHE.prev = he;
      }
      if (he.next && he.prev) {
        boundaryHalfedges.delete(key);
      }
      noNextBoundaryHalfedge.delete(key);
    }
  }

  /**
   * modelMatrix returns the transformation context as the model matrix
   * for the current frame (or at call time).
   *
   * @returns the model matrix at call time.
   */
  modelMatrix(): Matrix {
    return this.context;
  }
  /**
   * reset resets the transformation context.
   */
  resetContext() {
    this.context = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }
  /**
   * scale applies scale transformation on the given mesh.
   * @param sx is a scaling factor on x-axis
   * @param sy is a scaling factor on y-axis
   * @param sz is a scaling factor on z-axis
   */
  // prettier-ignore
  scale(sx: number, sy: number, sz: number) {
      const scaleM = new Matrix(
        sx, 0,  0, 0,
        0, sy,  0, 0,
        0,  0, sz, 0,
        0,  0,  0, 1
      );
      this.context = <Matrix>scaleM.mul(this.context);
    }
  /**
   * translate applies translation on the given mesh.
   * @param tx is a translation factor on x-axis
   * @param ty is a translation factor on y-axis
   * @param tz is a translation factor on z-axis
   */
  // prettier-ignore
  translate(tx: number, ty: number, tz: number) {
      const transM = new Matrix(
        1, 0, 0, tx,
        0, 1, 0, ty,
        0, 0, 1, tz,
        0, 0, 0, 1
      );
      this.context = <Matrix>transM.mul(this.context);
    }
  /**
   * rotate applies rotation on the given mesh.
   * @param dir is a given rotation direction.
   * @param angle is a given rotation angle counterclockwise.
   */
  rotate(dir: Vector, angle: number) {
    const u = dir.unit();
    const cosa = Math.cos(angle / 2);
    const sina = Math.sin(angle / 2);
    const q = new Quaternion(cosa, sina * u.x, sina * u.y, sina * u.z);
    this.context = <Matrix>q.toRotationMatrix().mul(this.context);
  }
}
