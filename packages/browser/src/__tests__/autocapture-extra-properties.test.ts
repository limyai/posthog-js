/// <reference lib="dom" />
/* eslint-disable compat/compat */

import { Autocapture } from '../autocapture'
import { FlagsResponse } from '../types'
import { PostHog } from '../posthog-core'
import { window } from '../utils/globals'
import { createPosthogInstance } from './helpers/posthog-instance'
import { uuidv7 } from '../uuidv7'
import { isUndefined } from '@posthog/core'

const triggerMouseEvent = function (node: Node, eventType: string) {
    node.dispatchEvent(
        new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
        })
    )
}

const simulateClick = function (el: Node) {
    triggerMouseEvent(el, 'click')
}

describe('Autocapture with css_selector_allowlist_extra_properties', () => {
    const originalWindowLocation = window!.location

    let autocapture: Autocapture
    let posthog: PostHog
    let beforeSendMock: jest.Mock

    beforeEach(async () => {
        jest.spyOn(window!.console, 'log').mockImplementation()

        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            writable: true,
            // eslint-disable-next-line compat/compat
            value: new URL('https://example.com'),
        })

        beforeSendMock = jest.fn().mockImplementation((...args) => args)

        posthog = await createPosthogInstance(uuidv7(), {
            api_host: 'https://test.com',
            token: 'testtoken',
            autocapture: true,
            before_send: beforeSendMock,
        })

        if (isUndefined(posthog.autocapture)) {
            throw new Error('helping TS by confirming this is created by now')
        }
        autocapture = posthog.autocapture
    })

    afterEach(() => {
        document.getElementsByTagName('html')[0].innerHTML = ''

        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: originalWindowLocation,
        })

        posthog.config.autocapture = false
    })

    // Enable autocapture for each test
    beforeEach(() => {
        autocapture.onRemoteConfig({} as FlagsResponse)
    })

    it('should add extra properties when css_selector_allowlist matches', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': {
                    'custom-id': '123',
                    'custom-name': 'my-button',
                    'custom-enabled': true,
                },
            },
        }

        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.event).toBe('$autocapture')
        expect(captureCall.properties).toHaveProperty('custom-id', '123')
        expect(captureCall.properties).toHaveProperty('custom-name', 'my-button')
        expect(captureCall.properties).toHaveProperty('custom-enabled', true)
    })

    it('should not add extra properties when css_selector_allowlist does not match', () => {
        const button = document.createElement('button')
        button.className = 'not-tracked'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': {
                    'custom-id': '123',
                },
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        // Should not capture at all since it doesn't match the allowlist
        expect(beforeSendMock).toHaveBeenCalledTimes(0)
    })

    it('should use the first matching selector when multiple selectors match', () => {
        const button = document.createElement('button')
        button.className = 'btn primary'
        button.setAttribute('data-track', 'yes')
        button.textContent = 'Click me'
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.btn', '.primary', '[data-track]'],
            css_selector_allowlist_extra_properties: {
                '.btn': {
                    'button-type': 'btn-class',
                },
                '.primary': {
                    'button-type': 'primary-class',
                },
                '[data-track]': {
                    'button-type': 'data-attribute',
                },
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        // Should use the first matching selector (.btn)
        expect(captureCall.properties).toHaveProperty('button-type', 'btn-class')
    })

    it('should support different property types (string, number, boolean)', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': {
                    'string-prop': 'hello',
                    'number-prop': 42,
                    'boolean-prop': false,
                    'zero-value': 0,
                    'empty-string': '',
                },
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.properties).toHaveProperty('string-prop', 'hello')
        expect(captureCall.properties).toHaveProperty('number-prop', 42)
        expect(captureCall.properties).toHaveProperty('boolean-prop', false)
        expect(captureCall.properties).toHaveProperty('zero-value', 0)
        expect(captureCall.properties).toHaveProperty('empty-string', '')
    })

    it('should not add properties when css_selector_allowlist_extra_properties is not configured', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.track-me'],
            // No css_selector_allowlist_extra_properties
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.properties).not.toHaveProperty('custom-id')
    })

    it('should not add properties when css_selector_allowlist is not configured', () => {
        const button = document.createElement('button')
        button.textContent = 'Click me'
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            // No css_selector_allowlist
            css_selector_allowlist_extra_properties: {
                '.track-me': {
                    'custom-id': '123',
                },
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.properties).not.toHaveProperty('custom-id')
    })

    it('should handle selector with no extra properties defined', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.other-selector': {
                    'custom-id': '123',
                },
                // .track-me is not in the extra_properties mapping
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.properties).not.toHaveProperty('custom-id')
    })

    it('should work with complex CSS selectors', () => {
        const button = document.createElement('button')
        button.setAttribute('type', 'button')
        button.setAttribute('data-action', 'save')
        button.setAttribute('data-form', 'user-form')
        button.textContent = 'Save'
        document.body.appendChild(button)

        posthog.config.autocapture = {
            css_selector_allowlist: ['button[type="button"][data-action="save"]'],
            css_selector_allowlist_extra_properties: {
                'button[type="button"][data-action="save"]': {
                    'action-type': 'form-save',
                    'priority': 1,
                },
            },
        }

        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.properties).toHaveProperty('action-type', 'form-save')
        expect(captureCall.properties).toHaveProperty('priority', 1)
    })

    it('should work when element is nested inside allowed selector', () => {
        const container = document.createElement('div')
        container.className = 'track-container'
        const button = document.createElement('button')
        button.textContent = 'Click me'
        container.appendChild(button)
        document.body.appendChild(container)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.track-container button'],
            css_selector_allowlist_extra_properties: {
                '.track-container button': {
                    'nested-element': true,
                },
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.properties).toHaveProperty('nested-element', true)
    })

    it('should not interfere with existing autocapture properties', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        button.setAttribute('data-test-id', 'my-button')
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': {
                    'custom-property': 'custom-value',
                },
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]

        // Should have custom property
        expect(captureCall.properties).toHaveProperty('custom-property', 'custom-value')

        // Should also have standard autocapture properties
        expect(captureCall.properties).toHaveProperty('$event_type', 'click')
        expect(captureCall.properties).toHaveProperty('$elements')
        expect(captureCall.properties['$elements'][0]).toHaveProperty('tag_name', 'button')
    })

    it('should handle empty extra properties object', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        const autocaptureConfig: AutocaptureConfig = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': {}, // Empty object
            },
        }

        posthog.config.autocapture = autocaptureConfig
        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.event).toBe('$autocapture')
        // Should not throw error, just capture normally
    })
})

