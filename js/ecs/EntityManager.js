'use strict';
/* =====================================================================
   DUST STRIKE — js/ecs/EntityManager.js
   Capa 3: ECS — Registro, almacenamiento y consulta de entidades
   ===================================================================== */

let nextEntityId = 1;

class EntityManagerClass {
  constructor() {
    this.entities = new Set();
    this.components = new Map(); // componentName -> Map(entityId -> componentData)
    this.tags = new Map(); // tag -> Set(entityId)
    this.systems = [];
  }

  createEntity(tag) {
    const id = nextEntityId++;
    this.entities.add(id);
    if (tag) {
      if (!this.tags.has(tag)) this.tags.set(tag, new Set());
      this.tags.get(tag).add(id);
    }
    return id;
  }

  destroyEntity(id) {
    this.entities.delete(id);
    for (const compMap of this.components.values()) {
      compMap.delete(id);
    }
    for (const tagSet of this.tags.values()) {
      tagSet.delete(id);
    }
  }

  addComponent(id, componentName, data) {
    if (!this.components.has(componentName)) {
      this.components.set(componentName, new Map());
    }
    this.components.get(componentName).set(id, data);
    return data;
  }

  getComponent(id, componentName) {
    const map = this.components.get(componentName);
    return map ? map.get(id) || null : null;
  }

  hasComponent(id, componentName) {
    const map = this.components.get(componentName);
    return map ? map.has(id) : false;
  }

  removeComponent(id, componentName) {
    const map = this.components.get(componentName);
    if (map) map.delete(id);
  }

  query(...componentNames) {
    const res = [];
    for (const id of this.entities) {
      let match = true;
      for (const name of componentNames) {
        const map = this.components.get(name);
        if (!map || !map.has(id)) { match = false; break; }
      }
      if (match) res.push(id);
    }
    return res;
  }

  getByTag(tag) {
    return this.tags.has(tag) ? Array.from(this.tags.get(tag)) : [];
  }

  registerSystem(systemFn) {
    this.systems.push(systemFn);
  }

  updateSystems(dt) {
    for (const sys of this.systems) {
      try {
        sys(this, dt);
      } catch (err) {
        console.error('[ECS System Error]:', err);
      }
    }
  }
}

const EntityManager = new EntityManagerClass();

if (typeof window !== 'undefined') window.EntityManager = EntityManager;
if (typeof globalThis !== 'undefined') globalThis.EntityManager = EntityManager;

