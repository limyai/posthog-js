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

    it('should add extra properties when css_selector_allowlist matches with default strategy', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'custom-id': '123',
                            'custom-name': 'my-button',
                            'custom-enabled': true,
                        },
                    },
                ],
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

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'custom-id': '123',
                        },
                    },
                ],
            },
        }

        simulateClick(button)

        // Should not capture at all since it doesn't match the allowlist
        expect(beforeSendMock).toHaveBeenCalledTimes(0)
    })

    it('should apply only the first matching config by priority (lowest priority wins)', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': [
                    {
                        strategy: 'default',
                        priority: 10,
                        properties: {
                            order: 'second',
                            'second': true,
                            'priority-value': 10,
                        },
                    },
                    {
                        strategy: 'default',
                        priority: 5,
                        properties: {
                            order: 'first',
                            'priority-value': 5,
                        },
                    },
                ],
            },
        }

        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        // Lower priority (5) is checked first and matches, so it's applied
        expect(captureCall.properties).toHaveProperty('order', 'first')
        expect(captureCall.properties).toHaveProperty('priority-value', 5)
        // Priority 10 is never checked since priority 5 already matched
        expect(captureCall.properties).not.toHaveProperty('second')
    })

    it('should use the first matching selector when multiple selectors match', () => {
        const button = document.createElement('button')
        button.className = 'btn primary'
        button.setAttribute('data-track', 'yes')
        button.textContent = 'Click me'
        document.body.appendChild(button)

        posthog.config.autocapture = {
            css_selector_allowlist: ['.btn', '.primary', '[data-track]'],
            css_selector_allowlist_extra_properties: {
                '.btn': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'button-type': 'btn-class',
                        },
                    },
                ],
                '.primary': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'button-type': 'primary-class',
                        },
                    },
                ],
                '[data-track]': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'button-type': 'data-attribute',
                        },
                    },
                ],
            },
        }

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

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'string-prop': 'hello',
                            'number-prop': 42,
                            'boolean-prop': false,
                            'zero-value': 0,
                            'empty-string': '',
                        },
                    },
                ],
            },
        }

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

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            // No css_selector_allowlist_extra_properties
        }

        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.properties).not.toHaveProperty('custom-id')
    })

    it('should not add properties when css_selector_allowlist is not configured', () => {
        const button = document.createElement('button')
        button.textContent = 'Click me'
        document.body.appendChild(button)

        posthog.config.autocapture = {
            // No css_selector_allowlist
            css_selector_allowlist_extra_properties: {
                '.track-me': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'custom-id': '123',
                        },
                    },
                ],
            },
        }

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

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.other-selector': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'custom-id': '123',
                        },
                    },
                ],
                // .track-me is not in the extra_properties mapping
            },
        }

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
                'button[type="button"][data-action="save"]': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'action-type': 'form-save',
                            priority: 1,
                        },
                    },
                ],
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

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-container button'],
            css_selector_allowlist_extra_properties: {
                '.track-container button': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'nested-element': true,
                        },
                    },
                ],
            },
        }

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

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': [
                    {
                        strategy: 'default',
                        priority: 1,
                        properties: {
                            'custom-property': 'custom-value',
                        },
                    },
                ],
            },
        }

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

    it('should handle empty extra properties array', () => {
        const button = document.createElement('button')
        button.className = 'track-me'
        button.textContent = 'Click me'
        document.body.appendChild(button)

        posthog.config.autocapture = {
            css_selector_allowlist: ['.track-me'],
            css_selector_allowlist_extra_properties: {
                '.track-me': [], // Empty array
            },
        }

        simulateClick(button)

        expect(beforeSendMock).toHaveBeenCalledTimes(1)
        const captureCall = beforeSendMock.mock.calls[0][0]
        expect(captureCall.event).toBe('$autocapture')
        // Should not throw error, just capture normally
    })

    describe('urlContains strategy', () => {
        it('should add properties when URL contains the specified string', () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                writable: true,
                // eslint-disable-next-line compat/compat
                value: new URL('https://example.com/dashboard/analytics'),
            })

            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/dashboard',
                            properties: {
                                'page-section': 'dashboard',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            expect(captureCall.properties).toHaveProperty('page-section', 'dashboard')
        })

        it('should not add properties when URL does not contain the specified string', () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                writable: true,
                // eslint-disable-next-line compat/compat
                value: new URL('https://example.com/settings'),
            })

            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/dashboard',
                            properties: {
                                'page-section': 'dashboard',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            expect(captureCall.properties).not.toHaveProperty('page-section')
        })

        it('should support regex patterns in urlContains', () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                writable: true,
                // eslint-disable-next-line compat/compat
                value: new URL('https://example.com/product/123/details'),
            })

            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/product/\\d+',
                            properties: {
                                'page-type': 'product-detail',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            expect(captureCall.properties).toHaveProperty('page-type', 'product-detail')
        })

        it('should skip non-matching urlContains and apply default strategy', () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                writable: true,
                // eslint-disable-next-line compat/compat
                value: new URL('https://example.com/settings'),
            })

            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/dashboard',
                            properties: {
                                'page-type': 'dashboard',
                            },
                        },
                        {
                            strategy: 'default',
                            priority: 5,
                            properties: {
                                'page-type': 'general',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            // URL doesn't match priority 1, so it skips to priority 5 (default)
            expect(captureCall.properties).toHaveProperty('page-type', 'general')
        })
    })

    describe('priority and strategy combinations', () => {
        it('should apply first matching config even with mixed strategies', () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                writable: true,
                // eslint-disable-next-line compat/compat
                value: new URL('https://example.com/dashboard'),
            })

            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/dashboard',
                            properties: {
                                source: 'urlContains-priority-1',
                            },
                        },
                        {
                            strategy: 'default',
                            priority: 2,
                            properties: {
                                source: 'default-priority-2',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            // First config matches, so only it is applied
            expect(captureCall.properties).toHaveProperty('source', 'urlContains-priority-1')
        })

        it('should skip to next priority if first does not match', () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                writable: true,
                // eslint-disable-next-line compat/compat
                value: new URL('https://example.com/settings'),
            })

            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/dashboard',
                            properties: {
                                location: 'dashboard',
                            },
                        },
                        {
                            strategy: 'urlContains',
                            priority: 2,
                            contains: '/checkout',
                            properties: {
                                location: 'checkout',
                            },
                        },
                        {
                            strategy: 'default',
                            priority: 3,
                            properties: {
                                location: 'other',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            // First two don't match URL, falls through to priority 3 (default)
            expect(captureCall.properties).toHaveProperty('location', 'other')
        })
    })

    describe('edge cases', () => {
        it('should handle empty properties object', () => {
            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'default',
                            priority: 1,
                            properties: {}, // Empty object
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            expect(captureCall.event).toBe('$autocapture')
            // Should not throw error, just capture normally
        })

        it('should handle missing contains for urlContains strategy', () => {
            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            // Missing contains field
                            properties: {
                                'should-not-appear': true,
                            },
                        } as any,
                        {
                            strategy: 'default',
                            priority: 2,
                            properties: {
                                'should-appear': true,
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            // Should not have the property from priority 1 (missing contains)
            expect(captureCall.properties).not.toHaveProperty('should-not-appear')
            // Should have the property from priority 2 (default)
            expect(captureCall.properties).toHaveProperty('should-appear', true)
        })

        it('should handle window being undefined gracefully', () => {
            // This test ensures the code doesn't crash in non-browser environments
            const button = document.createElement('button')
            button.className = 'track-me'
            button.textContent = 'Click me'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['.track-me'],
                css_selector_allowlist_extra_properties: {
                    '.track-me': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/dashboard',
                            properties: {
                                'page-type': 'dashboard',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            // Should not crash even if window.location is undefined
        })
    })

    describe('real-world scenarios', () => {
        it('should handle fallback from specific to general configs', () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                writable: true,
                // eslint-disable-next-line compat/compat
                value: new URL('https://example.com/about'),
            })

            const button = document.createElement('button')
            button.id = 'cta-button'
            button.textContent = 'Get Started'
            document.body.appendChild(button)

            posthog.config.autocapture = {
                css_selector_allowlist: ['#cta-button'],
                css_selector_allowlist_extra_properties: {
                    '#cta-button': [
                        {
                            strategy: 'urlContains',
                            priority: 1,
                            contains: '/pricing',
                            properties: {
                                context: 'pricing-page',
                                'cta-position': 'hero',
                            },
                        },
                        {
                            strategy: 'urlContains',
                            priority: 2,
                            contains: '/features',
                            properties: {
                                context: 'features-page',
                                'cta-position': 'comparison',
                            },
                        },
                        {
                            strategy: 'default',
                            priority: 99,
                            properties: {
                                context: 'general',
                                'cta-position': 'unknown',
                            },
                        },
                    ],
                },
            }

            simulateClick(button)

            expect(beforeSendMock).toHaveBeenCalledTimes(1)
            const captureCall = beforeSendMock.mock.calls[0][0]
            // URL doesn't match pricing or features, falls back to default
            expect(captureCall.properties).toHaveProperty('context', 'general')
            expect(captureCall.properties).toHaveProperty('cta-position', 'unknown')
        })
    })
})
