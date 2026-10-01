import { CollisionDetection, pointerWithin } from '@dnd-kit/core';

/** Marks an element that clips the droppables inside it, such as the board's scroll area. */
export const DROP_CLIP = 'data-drop-clip';

/**
 * `pointerWithin`, less any droppable the pointer only reaches outside the
 * element clipping it. dnd-kit measures droppables unclipped, so a zone scrolled
 * out of the board's view still lies under the out-of-play bar, and would win a
 * drop aimed at the Hand.
 */
export const pointerWithinVisible: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  if (!pointer) return [];

  return pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const clip = container.node.current?.closest(`[${DROP_CLIP}]`);
      if (!clip) return true;

      const rect = clip.getBoundingClientRect();

      return (
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom
      );
    }),
  });
};
