/** Names of the messages between the preload script and the main process (types only: the sandboxed preload cannot load other files). */
export type Channel = 'presets:list' | 'presets:read' | 'presets:save' | 'presets:delete' | 'presets:getActive' | 'presets:setActive' | 'benchmark:run' | 'benchmark:line';
