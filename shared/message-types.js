/**
 * shared/message-types.js
 * Convenience re-export of MESSAGE_TYPES plus message/response factory helpers.
 */

export { MESSAGE_TYPES } from './constants.js';

/**
 * Create a well-formed message object to send via chrome.runtime.sendMessage.
 * @param {string} type  — one of MESSAGE_TYPES
 * @param {object} data  — payload data
 * @returns {{ type: string, data: object, timestamp: number }}
 */
export function createMessage(type, data = {}) {
  return {
    type,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Create a standardised response object returned from the service worker.
 * @param {boolean} success
 * @param {*}       data
 * @param {string|null} error
 * @returns {{ success: boolean, data: *, error: string|null, timestamp: number }}
 */
export function createResponse(success, data = null, error = null) {
  return {
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}
