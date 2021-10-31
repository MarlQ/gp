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
    this.buildMesh(indices, positions);
  }

  /**
   * buildMesh builds half-edge based connectivity for the given vertex index buffer
   * and vertex position buffer.
   *
   * @param indices is the vertex index buffer that contains all vertex indices.
   * @param positions is the vertex buffer that contains all vertex positions.
   */
  buildMesh(indices: number[], positions: Vector[]) {
    // TODO: build the halfedge connectivity.
    //
    // We can assume the input mesh is a manifold mesh.
    
    
    indices = indices.slice(0, 6);
    console.log(indices)
    console.log(positions)

    positions.forEach((p, i) => {
      const vert = new Vertex(p);
      vert.idx = i;
      this.verts.push(vert); //TODO: halfedge?
    });

    console.log(this.verts);
    console.log(this.edges);
    console.log(this.faces);
    console.log(this.halfedges);

    indices.forEach((ele, index) => {
      
      

      //if(index < indices.length-1){
        const edge = new Edge();
        edge.idx = Math.floor(index/2);
        this.edges.push(edge);
        const halfedge = new Halfedge();
        halfedge.edge = edge;
        halfedge.vert = this.verts[ele]; // Originating vertex
        if(!this.verts[ele].halfedge) this.verts[ele].halfedge = halfedge;
        
        const prev = this.halfedges[this.halfedges.length-2];
        if(prev) {
          prev.next = halfedge;
          halfedge.prev = prev;
        }
        this.halfedges.push(halfedge);
        edge.halfedge = halfedge;

        // Create Twin
        const twin = new Halfedge();
        twin.edge = edge;
        twin.vert = this.verts[indices[index+1]];
        if(!this.verts[indices[index]].halfedge) this.verts[indices[index]].halfedge = twin;
        if(prev) {
          twin.next = prev.twin;
          if(prev.twin) prev.twin.prev = twin;
        }
        halfedge.twin = twin;
        twin.twin = halfedge;
        twin.onBoundary = true; // Assume this for now
        this.halfedges.push(twin);
      //}
      

      
      if(index !== 0 && (index+1)%3 === 0) {
        const face = new Face();
        face.idx = Math.floor(index/3);
        this.faces.push(face);

        for(let k = this.halfedges.length-6; k < this.halfedges.length-1; k++) {
          this.halfedges[k].face = face;
        }

        face.halfedge = this.halfedges[this.halfedges.length-6];
        this.halfedges[this.halfedges.length-2].next = this.halfedges[this.halfedges.length-6];
        this.halfedges[this.halfedges.length-6].prev = this.halfedges[this.halfedges.length-2];

        //TODO: Twin edges
        this.halfedges[this.halfedges.length-1].prev = this.halfedges[this.halfedges.length-5];
        this.halfedges[this.halfedges.length-5].next = this.halfedges[this.halfedges.length-1];
      }

    });

    // Find duplicates
    this.halfedges = this.halfedges.reduce( (a: Halfedge[] ,v) => {
      let preExiststingVal = a.find( aV => aV.vert == v.vert && aV.edge == v.edge  );
      if( preExiststingVal ){
        console.log("PRE EXIST")
        preExiststingVal.onBoundary = false;
      } else {
        a.push(v);
      }
      return a;
    } ,[]);

    /* const halfedges: Halfedge[] = [new Halfedge(), new Halfedge(), new Halfedge()];
        halfedges.forEach(h => h.face = face);

        halfedges.forEach(h => {
          // TODO: vert is starting vertex
          h.edge = this.edges
        });
        halfedges.forEach(h => this.halfedges.push(h)); // TODO: Sort out duplicates */
    let index = 0;
    this.halfedges.forEach(h => {
      h.idx = index++;
    });
    
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
